import { EventEmitter } from 'events';
import express from 'express';
import { createServer, Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { networkInterfaces } from 'os';
import QRCode from 'qrcode';
import { TranscriptSegment } from '../../shared/types/transcript';
import { DisplaySettings, DEFAULT_SETTINGS } from '../../shared/types/settings';
import { PacedSegment, NetworkStatus, SegmentUpdate } from '../../shared/types/ipc';

interface WSMessage {
  type: 'segment' | 'update' | 'settings' | 'clear' | 'welcome';
  payload: unknown;
}

export class NetworkServer extends EventEmitter {
  private app: express.Express | null = null;
  private httpServer: HTTPServer | null = null;
  private wss: WebSocketServer | null = null;
  private port: number;
  private _isRunning = false;
  private displaySettings: DisplaySettings = { ...DEFAULT_SETTINGS.display };
  private recentSegments: TranscriptSegment[] = [];
  private readonly maxRecentSegments = 50;

  constructor(port = 8080) {
    super();
    this.port = port;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  getStatus(): NetworkStatus {
    return {
      running: this._isRunning,
      port: this.port,
      url: this._isRunning ? `http://${this.getLocalIP()}:${this.port}` : '',
      connectedClients: this.wss ? this.wss.clients.size : 0,
    };
  }

  async start(): Promise<NetworkStatus> {
    if (this._isRunning) return this.getStatus();

    this.app = express();
    this.httpServer = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });

    // Apply a restrictive Content-Security-Policy to all responses
    this.app.use((_req, res, next) => {
      res.set(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' ws: wss:"
      );
      next();
    });

    // Serve the viewer HTML
    this.app.get('/', (_req, res) => {
      res.type('html').send(this.getViewerHTML());
    });

    // Health check / status endpoint
    this.app.get('/api/status', (_req, res) => {
      res.json({
        app: 'AutoScribe',
        clients: this.wss?.clients.size ?? 0,
      });
    });

    // WebSocket connection handling
    this.wss.on('connection', (ws: WebSocket) => {
      console.log(`[Network] Viewer connected (${this.wss!.clients.size} total)`);

      // Send current display settings and recent segments
      const welcome: WSMessage = {
        type: 'welcome',
        payload: {
          settings: this.displaySettings,
          recentSegments: this.recentSegments,
        },
      };
      ws.send(JSON.stringify(welcome));

      ws.on('close', () => {
        console.log(`[Network] Viewer disconnected (${this.wss!.clients.size} total)`);
      });
    });

    return new Promise((resolve, reject) => {
      this.httpServer!.listen(this.port, () => {
        this._isRunning = true;
        const status = this.getStatus();
        console.log(`[Network] Server running at ${status.url}`);
        resolve(status);
      });

      this.httpServer!.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`[Network] Port ${this.port} already in use`);
        }
        this._isRunning = false;
        reject(err);
      });
    });
  }

  stop(): void {
    if (!this._isRunning) return;

    // Close all WebSocket connections
    if (this.wss) {
      this.wss.clients.forEach((client) => client.close());
      this.wss.close();
      this.wss = null;
    }

    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }

    this.app = null;
    this._isRunning = false;
    console.log('[Network] Server stopped');
  }

  broadcastSegment(paced: PacedSegment): void {
    // Store for new viewers joining
    this.recentSegments.push(paced.segment);
    if (this.recentSegments.length > this.maxRecentSegments) {
      this.recentSegments = this.recentSegments.slice(-this.maxRecentSegments);
    }

    this.broadcast({ type: 'segment', payload: paced });
  }

  /**
   * Push an operator correction for a segment viewers have already received.
   * The replay buffer is corrected too, so a phone joining later gets the
   * fixed text rather than the original transcription.
   */
  broadcastSegmentUpdate(update: SegmentUpdate): void {
    const index = this.recentSegments.findIndex((s) => s.id === update.id);
    if (index !== -1) {
      this.recentSegments[index] = { ...this.recentSegments[index], text: update.text };
    }
    this.broadcast({ type: 'update', payload: update });
  }

  broadcastSettings(settings: DisplaySettings): void {
    this.displaySettings = { ...this.displaySettings, ...settings };
    this.broadcast({ type: 'settings', payload: this.displaySettings });
  }

  broadcastClear(): void {
    this.recentSegments = [];
    this.broadcast({ type: 'clear', payload: null });
  }

  async getQRCode(): Promise<string> {
    const url = `http://${this.getLocalIP()}:${this.port}`;
    return QRCode.toDataURL(url, { width: 256, margin: 2 });
  }

  private broadcast(message: WSMessage): void {
    if (!this.wss) return;
    const data = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  private getLocalIP(): string {
    const interfaces = networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return '127.0.0.1';
  }

  private getViewerHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>AutoScribe Viewer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: Arial, sans-serif;
      overflow: hidden;
      height: 100vh;
      transition: background-color 0.3s, color 0.3s;
    }

    #container {
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 2rem;
      overflow-y: auto;
    }

    .line {
      margin-bottom: 0.75rem;
      transition: opacity 0.5s;
    }

    #status {
      position: fixed;
      top: 0.5rem;
      right: 0.5rem;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.7rem;
      opacity: 0.5;
      z-index: 10;
    }

    .status-connected { background: #22c55e; color: white; }
    .status-disconnected { background: #ef4444; color: white; }
    .status-connecting { background: #eab308; color: white; }

    #waiting {
      text-align: center;
      opacity: 0.2;
      font-size: 1.5rem;
    }

    @media (max-width: 640px) {
      #container { padding: 1rem; }
    }
  </style>
</head>
<body>
  <div id="status" class="status-connecting">Connecting...</div>
  <div id="container">
    <p id="waiting">Waiting for transcription...</p>
  </div>

  <script>
    const container = document.getElementById('container');
    const statusEl = document.getElementById('status');
    const waitingEl = document.getElementById('waiting');
    const MAX_LINES = 30;
    let lines = [];
    let settings = {};
    let ws;
    let reconnectTimer;

    function applySettings(s) {
      settings = s;
      document.body.style.fontFamily = s.fontFamily || 'Arial, sans-serif';
      document.body.style.fontSize = (s.fontSize || 32) + 'px';
      document.body.style.color = s.textColor || '#000000';
      document.body.style.backgroundColor = s.backgroundColor || '#FFFFFF';
      document.body.style.lineHeight = s.lineHeight || 1.6;
      container.style.textAlign = s.textAlign || 'left';
    }

    var BOOKS = [
      'Song of Solomon','1 Thessalonians','2 Thessalonians','1 Chronicles','2 Chronicles',
      '1 Corinthians','2 Corinthians','Ecclesiastes','Deuteronomy','Lamentations',
      'Philippians','1 Samuel','2 Samuel','Colossians','1 Timothy','2 Timothy',
      'Habakkuk','Zephaniah','Zechariah','Ephesians','Galatians','Revelation',
      'Leviticus','Nehemiah','Proverbs','Jeremiah','1 Kings','2 Kings','1 Peter',
      '2 Peter','Genesis','Matthew','Numbers','Philemon','Hebrews','Obadiah',
      'Ezekiel','Psalms','Psalm','Isaiah','Daniel','Joshua','Judges','Esther',
      'Exodus','Haggai','Micah','Nahum','Hosea','Jonah','Titus','James',
      '1 John','2 John','3 John','Luke','John','Mark','Joel','Amos','Jude',
      'Acts','Ruth','Job','Ezra'
    ];
    var VC={genesis:[31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26],exodus:[22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38],leviticus:[17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34],numbers:[54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13],deuteronomy:[46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12],joshua:[18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33],judges:[36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25],ruth:[22,23,18,22],'1 samuel':[28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,43,15,23,28,23,44,25,12,25,11,31,13],'2 samuel':[27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25],'1 kings':[53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53],'2 kings':[18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30],'1 chronicles':[54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30],'2 chronicles':[17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23],ezra:[11,70,13,24,17,22,28,36,15,44],nehemiah:[11,20,32,23,19,19,73,18,38,39,36,47,31],esther:[22,23,15,17,14,14,10,17,32,3],job:[22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,35,27,26,40],psalm:[6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6],psalms:[6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6],proverbs:[33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31],ecclesiastes:[18,26,22,16,20,12,29,17,18,20,10,14],'song of solomon':[17,17,11,16,12,14,14,17],isaiah:[31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24],jeremiah:[19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34],lamentations:[22,22,66,22,22],ezekiel:[28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35],daniel:[21,49,30,37,31,28,28,27,27,21,45,13],hosea:[11,23,5,19,15,11,16,14,17,15,12,14,16,9],joel:[20,32,21],amos:[15,16,15,13,27,14,17,14,15],obadiah:[21],jonah:[17,10,10,11],micah:[16,13,12,13,15,16,20],nahum:[15,14,19],habakkuk:[17,20,19],zephaniah:[18,15,20],haggai:[15,23],zechariah:[21,13,10,14,11,15,14,23,17,12,17,14,9,21],malachi:[14,17,18,6],matthew:[25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20],mark:[45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20],luke:[80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53],john:[51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25],acts:[26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31],romans:[32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27],'1 corinthians':[31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24],'2 corinthians':[24,17,18,18,21,18,16,24,15,18,33,21,14],galatians:[24,21,29,31,26,18],ephesians:[23,22,21,32,33,24],philippians:[30,30,21,23],colossians:[29,23,25,18],'1 thessalonians':[10,20,13,18,28],'2 thessalonians':[12,17,18],'1 timothy':[20,15,16,16,25,21],'2 timothy':[18,26,17,22],titus:[16,15,15],philemon:[25],hebrews:[14,18,19,16,14,20,28,13,28,39,40,29,25],james:[27,26,18,17,20],'1 peter':[25,25,22,19,14],'2 peter':[21,22,18],'1 john':[10,29,24,21,21],'2 john':[13],'3 john':[14],jude:[25],revelation:[20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21]};

    function isValidRef(book,ch,v){var c=VC[book.toLowerCase()];return c&&ch>=1&&ch<=c.length&&v>=1&&v<=c[ch-1];}
    function splitDigits(book,digits){var best=null;for(var i=1;i<digits.length;i++){var ch=parseInt(digits.slice(0,i),10),v=parseInt(digits.slice(i),10);if(v>0&&isValidRef(book,ch,v)){if(!best||ch>best.ch)best={ch:ch,v:v};}}return best?book+' '+best.ch+':'+best.v:null;}

    function findBookAt(text,start){
      var sub=text.slice(start);
      for(var b=0;b<BOOKS.length;b++){
        var book=BOOKS[b];
        if(sub.length<book.length)continue;
        if(sub.slice(0,book.length).toLowerCase()===book.toLowerCase()){
          var after=sub[book.length];
          if(!after||after===' '||after==='\\t')return book;
        }
      }
      return null;
    }

    function parseRefAfter(book,text){
      var trimmed=text.replace(/^\\s+/,'');
      var sp=text.length-trimmed.length;
      if(sp===0)return null;
      var m;
      m=trimmed.match(/^chapter\\s+(\\d+)\\s+verses?\\s+(\\d+)(?:\\s+(?:through|to|-)\\s+(\\d+))?/i);
      if(m)return{ref:m[3]?book+' '+m[1]+':'+m[2]+'-'+m[3]:book+' '+m[1]+':'+m[2],len:sp+m[0].length};
      m=trimmed.match(/^(\\d+):(\\d+)(?:\\s*-\\s*(\\d+)(?::(\\d+))?)?/);
      if(m)return{ref:book+' '+m[0],len:sp+m[0].length};
      m=trimmed.match(/^(\\d{1,3})\\s+(\\d{1,3})(?:\\s*-\\s*(\\d+))?/);
      if(m)return{ref:m[3]?book+' '+m[1]+':'+m[2]+'-'+m[3]:book+' '+m[1]+':'+m[2],len:sp+m[0].length};
      m=trimmed.match(/^(\\d{2,})/);
      if(m){var r=splitDigits(book,m[1]);if(r)return{ref:r,len:sp+m[0].length};}
      return null;
    }

    function formatWithBibleRefs(text){
      var parts=[],pos=0;
      while(pos<text.length){
        var found=false;
        for(var i=pos;i<text.length;i++){
          var book=findBookAt(text,i);
          if(!book)continue;
          var result=parseRefAfter(book,text.slice(i+book.length));
          if(!result)continue;
          if(i>pos){var before=text.slice(pos,i).trim();if(before)parts.push({text:before,isRef:false});}
          parts.push({text:result.ref,isRef:true});
          pos=i+book.length+result.len;
          found=true;
          break;
        }
        if(!found){var rem=text.slice(pos).trim();if(rem)parts.push({text:rem,isRef:false});break;}
      }
      if(parts.length===0)parts.push({text:text,isRef:false});
      return parts;
    }

    function renderLines() {
      // Remove old line elements
      container.querySelectorAll('.line').forEach(el => el.remove());

      if (lines.length === 0) {
        waitingEl.style.display = 'block';
        return;
      }
      waitingEl.style.display = 'none';

      lines.forEach((line, i) => {
        const div = document.createElement('div');
        div.className = 'line';
        const recency = (i + 1) / lines.length;
        div.style.opacity = Math.max(0.3, recency);

        const parts = formatWithBibleRefs(line.text);
        parts.forEach(part => {
          if (part.isRef) {
            const p = document.createElement('p');
            p.style.fontWeight = 'bold';
            p.style.margin = '0.5rem 0';
            p.textContent = part.text;
            div.appendChild(p);
          } else {
            const span = document.createElement('span');
            span.textContent = part.text;
            div.appendChild(span);
          }
        });

        container.appendChild(div);
      });

      container.scrollTop = container.scrollHeight;
    }

    function addSegment(segment) {
      // Streaming mode re-sends the same id as a segment grows, so upsert
      // rather than append or the same sentence stacks up line after line.
      const existing = lines.findIndex(function (l) { return l.id === segment.id; });
      if (existing !== -1) {
        lines[existing] = { id: segment.id, text: segment.text };
      } else {
        lines.push({ id: segment.id, text: segment.text });
        if (lines.length > MAX_LINES) {
          lines = lines.slice(-MAX_LINES);
        }
      }
      renderLines();
    }

    function updateSegment(update) {
      const index = lines.findIndex(function (l) { return l.id === update.id; });
      if (index === -1) return;
      lines[index] = { id: update.id, text: update.text };
      renderLines();
    }

    function connect() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + location.host);

      ws.onopen = () => {
        statusEl.textContent = 'Connected';
        statusEl.className = 'status-connected';
        clearTimeout(reconnectTimer);
      };

      ws.onclose = () => {
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'status-disconnected';
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'welcome':
            if (msg.payload.settings) applySettings(msg.payload.settings);
            if (msg.payload.recentSegments) {
              lines = [];
              msg.payload.recentSegments.forEach(seg => {
                lines.push({ id: seg.id, text: seg.text });
              });
              if (lines.length > MAX_LINES) lines = lines.slice(-MAX_LINES);
              renderLines();
            }
            break;
          case 'segment':
            addSegment(msg.payload.segment);
            break;
          case 'update':
            updateSegment(msg.payload);
            break;
          case 'settings':
            applySettings(msg.payload);
            break;
          case 'clear':
            lines = [];
            renderLines();
            break;
        }
      };
    }

    connect();
  </script>
</body>
</html>`;
  }
}
