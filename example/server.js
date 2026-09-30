// server.js: Web server thuần Node không cần cài gì
const http = require("http");
const fs = require("fs");
const path = require("path");

const port = 8080;
// Serve từ root project (thư mục cha của example)
const root = path.join(__dirname, '..');

http.createServer((req, res) => {
    // Nếu truy cập root, serve example/index.html
    // Bỏ ?query/#hash khi tìm file
    const pathname = decodeURIComponent(req.url.split(/[?#]/)[0]);
    let urlPath = pathname === "/" ? "/example/index.html" : pathname;
    let filePath = path.join(root, urlPath);

    // Nếu file không tồn tại → trả 404
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end("404 Not Found");
        } else {
            res.writeHead(200);
            res.end(content);
        }
    });
}).listen(port);

console.log(`Server chạy tại: http://localhost:${port}`);
