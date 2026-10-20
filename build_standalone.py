"""把开发文件合并为可双击打开的单文件版本。"""

from pathlib import Path


folder = Path(__file__).resolve().parent
html = (folder / "index.html").read_text(encoding="utf-8")
css = (folder / "style.css").read_text(encoding="utf-8")
engine = (folder / "engine.js").read_text(encoding="utf-8")
app = (folder / "app.js").read_text(encoding="utf-8")

html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}\n</style>")
html = html.replace('  <script src="engine.js" defer></script>\n', "")
html = html.replace('  <script src="app.js" defer></script>\n', "")
html = html.replace("</body>", f"<script>\n{engine}\n</script>\n<script>\n{app}\n</script>\n</body>")

output = folder / "花砖物语助手.html"
output.write_text(html, encoding="utf-8")
print(output)
