"""把开发文件合并为可双击打开的单文件版本。"""

from pathlib import Path
import re


folder = Path(__file__).resolve().parent
html = (folder / "index.html").read_text(encoding="utf-8")
html = re.sub(r'<link rel="stylesheet" href="([^"?]+)(?:\?[^\"]*)?">',
              lambda match: "<style>\n" + (folder / match[1]).read_text(encoding="utf-8") + "\n</style>", html)
scripts = re.findall(r'<script src="([^"?]+)(?:\?[^\"]*)?" defer></script>', html)
html = re.sub(r'  <script src="[^\"]+" defer></script>\n', "", html)
worker = "\n".join((folder / name).read_text(encoding="utf-8") for name in ("engine.js", "search-ai.js", "ai.js", "worker-handler.js"))
(folder / "ai-worker.js").write_text(worker, encoding="utf-8")
inline = '<script id="ai-worker-source" type="text/plain">\n' + worker + "\n</script>\n"
inline += "\n".join("<script>\n" + (folder / name).read_text(encoding="utf-8") + "\n</script>" for name in scripts)
html = html.replace("</body>", inline + "\n</body>")

output = folder / "花砖物语助手.html"
output.write_text(html, encoding="utf-8")
print(output)
