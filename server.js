const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const rootDir = __dirname;
const port = Number.parseInt(process.env.PORT || "5173", 10);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function send(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/") pathname = "/index.html";

    // Prevent path traversal
    const normalizedPath = path.normalize(pathname).replace(/^([/\\])+/, "");
    const filePath = path.join(rootDir, normalizedPath);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(rootDir))) {
      return send(
        res,
        400,
        { "Content-Type": "text/plain; charset=utf-8" },
        "Bad Request",
      );
    }

    fs.stat(resolved, (statErr, stat) => {
      if (statErr || !stat.isFile()) {
        return send(
          res,
          404,
          { "Content-Type": "text/plain; charset=utf-8" },
          "Not Found",
        );
      }

      const ext = path.extname(resolved).toLowerCase();
      const contentType = contentTypes[ext] || "application/octet-stream";

      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(resolved).pipe(res);
    });
  } catch (err) {
    send(
      res,
      500,
      { "Content-Type": "text/plain; charset=utf-8" },
      "Internal Server Error",
    );
  }
});

server.listen(port, () => {
  console.log(`Frontend running at http://localhost:${port}`);
  console.log("Tip: start the backend separately on http://localhost:8000");
});
