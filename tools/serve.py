#!/usr/bin/env python3
"""Static server for web/ that disables browser caching (ES modules otherwise stay cached across edits)."""
import http.server, os, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web'))
http.server.ThreadingHTTPServer(('0.0.0.0', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
