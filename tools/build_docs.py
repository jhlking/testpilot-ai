"""构建 GitHub Pages 静态演示目录 docs/。

流程：
  1) 调用 tools/gen_standalone.py 依据 corpus.json + seed.py 重新生成 web/standalone.js
     （保证"纯前端 Demo 引擎"与"服务端引擎"语料/种子/算法完全一致）
  2) 把 web/ 下的 index.html / style.css / app.js / i18n.js / standalone.js 复制到 docs/
  3) 用文件内容哈希刷新 index.html 里的 ?v= 版本号，避免浏览器缓存旧资源

运行： python tools/build_docs.py
"""
import hashlib
import io
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
DOCS = os.path.join(ROOT, "docs")
ASSETS = ["style.css", "app.js", "i18n.js", "standalone.js"]


def run_standalone():
    script = os.path.join(ROOT, "tools", "gen_standalone.py")
    subprocess.check_call([sys.executable, script], cwd=ROOT)


def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()[:8]


def main():
    run_standalone()
    os.makedirs(DOCS, exist_ok=True)

    for name in ASSETS:
        shutil.copyfile(os.path.join(WEB, name), os.path.join(DOCS, name))

    html = io.open(os.path.join(WEB, "index.html"), encoding="utf-8").read()
    for name in ASSETS:
        v = digest(os.path.join(DOCS, name))
        html = re.sub(r"(%s)\?v=[\w\.\-]+" % re.escape(name), r"\1?v=" + v, html)
    io.open(os.path.join(DOCS, "index.html"), "w", encoding="utf-8", newline="\n").write(html)

    print("docs/ 已同步：")
    for name in ["index.html"] + ASSETS:
        p = os.path.join(DOCS, name)
        print("  %-16s %8d B" % (name, os.path.getsize(p)))


if __name__ == "__main__":
    main()
