"""用 Edge + CDP 对本地运行中的 TestPilot AI 做视口级视觉验收截图。

前置：python server.py 已在 8765 端口运行。
运行： python tools/shots.py
"""
import sys, os, json, time, base64, socket, struct, urllib.request, subprocess, tempfile

CDP_HTTP = "http://127.0.0.1:9333"
PORT = 9333
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "shots")
BASE = "http://127.0.0.1:8765/"
VIEW = {"width": 1560, "height": 980, "deviceScaleFactor": 1, "mobile": False}
EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

# (文件名, 完整 URL, 等待秒数, 可选页内 JS)
FLOW = [
    ("01_dashboard_zh", BASE + "?v=s2#dashboard", 2.2, None),
    ("02_projects_zh",  BASE + "?v=s2#projects",  1.8, None),
    ("03_cases_zh",     BASE + "?v=s2#cases",     1.8, None),
    ("04_generate_zh",  BASE + "?v=s2#generate",  1.8, None),
    ("05_defects_zh",   BASE + "?v=s2#defects",   1.8, None),
    ("06_generate_result_zh", BASE + "?v=s2&gen=pay", 5.0, None),
    ("07_dashboard_en", BASE + "?v=s2&lang=en#dashboard", 2.2, None),
    ("08_dashboard_ja", BASE + "?v=s2&lang=ja#dashboard", 2.2, None),
]


def clean_proxy_env():
    for k in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY",
              "all_proxy", "ALL_PROXY"):
        os.environ.pop(k, None)
    os.environ["NO_PROXY"] = "127.0.0.1,localhost"
    os.environ["no_proxy"] = "127.0.0.1,localhost"


def ensure_edge():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        opener.open(CDP_HTTP + "/json/version", timeout=3)
        return True
    except Exception:
        pass
    exe = next((p for p in EDGE_PATHS if os.path.exists(p)), None)
    if not exe:
        print("!! 找不到 Edge")
        return False
    ud = os.path.join(tempfile.gettempdir(), "edge-cdp-tp")
    flags = [exe, "--headless=new", "--disable-gpu", "--no-sandbox",
             f"--remote-debugging-port={PORT}", f"--user-data-dir={ud}",
             "--window-size=1560,980", "--hide-scrollbars",
             "--no-proxy-server", "about:blank"]
    subprocess.Popen(flags, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     creationflags=getattr(subprocess, "DETACHED_PROCESS", 0))
    for _ in range(25):
        time.sleep(1)
        try:
            opener.open(CDP_HTTP + "/json/version", timeout=2)
            print("Edge 已启动 (CDP %d)" % PORT)
            return True
        except Exception:
            continue
    return False


def ws_connect(url):
    rest = url[5:]
    hostport, _, path = rest.partition("/")
    path = "/" + path
    host, _, port = hostport.partition(":")
    port = int(port or 80)
    s = socket.create_connection((host, port), timeout=15)
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall((
        f"GET {path} HTTP/1.1\r\nHost: {hostport}\r\n"
        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    ).encode())
    buf = b""
    while b"\r\n\r\n" not in buf:
        buf += s.recv(4096)
    return s


def ws_send(s, payload):
    data = payload.encode()
    hdr = bytearray([0x81])
    n = len(data)
    if n < 126:
        hdr.append(0x80 | n)
    elif n < 65536:
        hdr.append(0x80 | 126); hdr += struct.pack(">H", n)
    else:
        hdr.append(0x80 | 127); hdr += struct.pack(">Q", n)
    mask = os.urandom(4)
    hdr += mask
    s.sendall(bytes(hdr) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))


def ws_recv(s, timeout=30):
    s.settimeout(timeout)
    h = s.recv(2)
    if len(h) < 2:
        return None
    ln = h[1] & 0x7F
    if ln == 126:
        ln = struct.unpack(">H", s.recv(2))[0]
    elif ln == 127:
        ln = struct.unpack(">Q", s.recv(8))[0]
    data = b""
    while len(data) < ln:
        chunk = s.recv(ln - len(data))
        if not chunk:
            break
        data += chunk
    return data.decode("utf-8", "replace")


class Client:
    def __init__(self, ws_url):
        self.s = ws_connect(ws_url)
        self.mid = 0

    def cmd(self, method, params=None, session=None, timeout=30):
        self.mid += 1
        msg = {"id": self.mid, "method": method}
        if params:
            msg["params"] = params
        if session:
            msg["sessionId"] = session
        ws_send(self.s, json.dumps(msg))
        self.s.settimeout(timeout)
        while True:
            r = ws_recv(self.s, timeout)
            if r is None:
                return None
            try:
                j = json.loads(r)
            except Exception:
                continue
            if j.get("id") == self.mid:
                return j

    def ev(self, expr, session):
        r = self.cmd("Runtime.evaluate",
                     {"expression": expr, "returnByValue": True}, session)
        res = (r or {}).get("result", {})
        if "exceptionDetails" in res:
            return "EXC:" + str(res["exceptionDetails"])[:150]
        return res.get("result", {}).get("value")


def wait_ready(b, sid, timeout=10.0):
    """等内容区真正渲染出节点再截图，避免抓到首屏空壳。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        n = b.ev("(function(){var c=document.querySelector('#content');return c?c.children.length:0})()", sid)
        if isinstance(n, int) and n > 0:
            return True
        time.sleep(0.25)
    return False


def main():
    clean_proxy_env()
    outdir = os.path.abspath(OUT)
    os.makedirs(outdir, exist_ok=True)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    # 服务健康检查
    try:
        code = opener.open(BASE + "api/health", timeout=5).status
        print("local server:", code)
    except Exception as e:
        print("!! 本地服务不可用:", e)
        sys.exit(1)

    if not ensure_edge():
        sys.exit(1)

    ver = json.loads(opener.open(CDP_HTTP + "/json/version").read())
    b = Client(ver["webSocketDebuggerUrl"])
    tid = b.cmd("Target.createTarget", {"url": "about:blank"})["result"]["targetId"]
    sid = b.cmd("Target.attachToTarget", {"targetId": tid, "flatten": True})["result"]["sessionId"]
    b.cmd("Page.enable", {}, sid)
    b.cmd("Runtime.enable", {}, sid)
    b.cmd("Emulation.setDeviceMetricsOverride", VIEW, sid)

    # 先清掉上一次运行残留的语言偏好 / 本地库，避免截图语言串台
    # 注意：这里必须用一个和 FLOW 不同的 URL，否则只改 hash 不会真正重新加载页面
    b.cmd("Page.navigate", {"url": BASE + "?v=s2&reset=1"}, sid)
    time.sleep(1.8)
    b.ev("localStorage.clear(); sessionStorage.clear(); 'ok'", sid)
    time.sleep(0.3)

    for name, url, wait, script in FLOW:
        nav = b.cmd("Page.navigate", {"url": url}, sid)
        err = (nav or {}).get("result", {}).get("errorText")
        if err:
            print("!! navigate error", name, err)
        time.sleep(wait)
        if script:
            b.ev(script, sid)
        wait_ready(b, sid)
        time.sleep(0.5)
        r = b.cmd("Page.captureScreenshot", {"format": "png"}, sid, timeout=60)
        if not r or "result" not in r:
            print("!! capture failed", name, str(r)[:200])
            continue
        data = base64.b64decode(r["result"]["data"])
        fp = os.path.join(outdir, name + ".png")
        open(fp, "wb").write(data)
        head = b.ev("(document.querySelector('.crumb')||{}).textContent||''", sid)
        print("saved %-20s %8dB  %s" % (name, len(data), (head or "")[:60]))

    b.cmd("Target.closeTarget", {"targetId": tid})
    print("DONE ->", outdir)


if __name__ == "__main__":
    main()
