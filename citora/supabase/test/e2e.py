"""Prueba de punta a punta: app real + PostgREST + PostgreSQL. La autenticación se simula."""
import base64, hashlib, hmac, json, os, subprocess, sys, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

SECRET = b"super-secret-jwt-token-for-local-testing-only-123456"
APP = "http://localhost:4173"
SHOTS = sys.argv[1]
USERS = {"leo@test.com": "aaaaaaaa-0000-0000-0000-000000000001", "osmel@test.com": "aaaaaaaa-0000-0000-0000-000000000009"}
PSQL = ["psql", "-h", "/var/tmp/citora-pg", "-p", "5544", "-U", "postgres", "-d", "e2e", "-tAc"]

def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()
def jwt(sub, email):
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    p = b64(json.dumps({"sub": sub, "email": email, "role": "authenticated", "aud": "authenticated", "exp": int(time.time()) + 3600}).encode())
    s = b64(hmac.new(SECRET, f"{h}.{p}".encode(), hashlib.sha256).digest())
    return f"{h}.{p}.{s}"
def session(email):
    uid = USERS[email]
    return {"access_token": jwt(uid, email), "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600,
            "refresh_token": "r-" + uid, "user": {"id": uid, "email": email, "aud": "authenticated", "role": "authenticated",
            "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"}}
def sql(q): return subprocess.run(PSQL + [q], capture_output=True, text=True).stdout.strip()

errors = []
def handler(route):
    req = route.request
    u = urlparse(req.url)
    if u.path.startswith("/rest/v1/"):
        headers = {k: v for k, v in req.headers.items() if k.lower() not in ("host", "apikey")}
        if headers.get("authorization", "") == "Bearer anon-key":
            headers.pop("authorization")
        target = "http://localhost:3300/" + u.path[len("/rest/v1/"):] + (("?" + u.query) if u.query else "")
        resp = route.fetch(url=target, headers=headers)
        if resp.status >= 400:
            errors.append(f"{req.method} {u.path} -> {resp.status} {resp.text()[:200]}")
        route.fulfill(response=resp)
        return
    if u.path in ("/auth/v1/signup", "/auth/v1/token"):
        body = json.loads(req.post_data or "{}")
        email = body.get("email")
        if email not in USERS:
            route.fulfill(status=400, json={"error": "invalid_grant", "error_description": "Invalid login credentials"}); return
        route.fulfill(status=200, json=session(email)); return
    if u.path == "/auth/v1/user":
        tok = req.headers.get("authorization", "").replace("Bearer ", "")
        payload = json.loads(base64.urlsafe_b64decode(tok.split(".")[1] + "=="))
        route.fulfill(status=200, json=session(payload["email"])["user"]); return
    if u.path == "/auth/v1/logout":
        route.fulfill(status=204, body=""); return
    route.fulfill(status=404, json={"message": "no simulado"})

def shot(page, name, full=True):
    page.wait_for_timeout(400)
    page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=full)
    print("captura", name)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="es-ES", timezone_id="America/Havana")
    ctx.route("http://supa.test/**", handler)
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and errors.append("console: " + m.text))
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))

    # 1. Portada
    page.goto(APP + "/")
    page.get_by_text("La app de reservas de tu negocio").wait_for()
    shot(page, "01-portada")

    # 2. Asistente
    page.goto(APP + "/crear")
    page.get_by_role("button", name="💈 Barbería").click()
    page.get_by_placeholder("Ej. Barbería Leo").fill("Barbería Leo")
    page.get_by_placeholder("53 5555 5555").fill("53 5 123 4567")
    page.get_by_placeholder("Calle, número, municipio").fill("Calle Medio 45, Matanzas")
    page.get_by_label("Color #0369a1").click()
    page.get_by_text("✓ Disponible").wait_for()
    shot(page, "02-asistente-negocio")
    page.get_by_role("button", name="Siguiente").click()
    page.get_by_text("Tus servicios").wait_for()
    shot(page, "03-asistente-servicios")
    page.get_by_role("button", name="Siguiente").click()
    page.get_by_text("Tu horario").wait_for()
    shot(page, "04-asistente-horario")
    page.get_by_role("button", name="Siguiente").click()
    page.get_by_placeholder("tucorreo@ejemplo.com").fill("leo@test.com")
    page.locator("input[type=password]").fill("secreto123")
    page.get_by_role("button", name="Crear mi app").click()
    page.get_by_text("¡Tu app está lista!").wait_for()
    shot(page, "05-app-lista")
    assert sql("select count(*) from services s join businesses b on b.id=s.business_id where b.slug='barberia-leo'") == "3"

    # 3. Web pública y reserva (otro navegador, sin sesión)
    client = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="es-ES", timezone_id="America/Havana")
    client.route("http://supa.test/**", handler)
    cp = client.new_page()
    cp.on("pageerror", lambda e: errors.append("pageerror cliente: " + str(e)))
    cp.goto(APP + "/barberia-leo")
    cp.get_by_role("heading", name="Barbería Leo").wait_for()
    shot(cp, "06-web-negocio")
    cp.get_by_role("link", name="Reservar cita").click()
    cp.get_by_role("button", name="Corte + barba").click()
    shot(cp, "07-reserva-servicio", full=False)
    cp.get_by_role("button", name="Continuar").click()
    days = cp.locator("button.aspect-square:not([disabled])")
    days.nth(1).click()
    cp.locator("div.grid button:not([disabled])", has_text=":").first.wait_for()
    shot(cp, "08-reserva-dia-hora")
    cp.locator("div.grid button:not([disabled])", has_text="10:00").first.click()
    cp.get_by_role("button", name="Continuar").click()
    cp.locator("input[autocomplete=name]").fill("Juan Pérez")
    cp.locator("input[type=tel]").fill("53 5 222 3333")
    cp.get_by_role("button", name="Continuar").click()
    cp.locator("input[type=checkbox]").check()
    shot(cp, "09-reserva-confirmar")
    cp.get_by_role("button", name="Confirmar reserva").click()
    cp.get_by_text("¡Reserva hecha!").wait_for()
    shot(cp, "10-cita-cliente")
    assert sql("select count(*) from appointments") == "1"

    # 4. Panel del dueño
    page.goto(APP + "/panel")
    page.get_by_text("Citas de hoy").wait_for()
    shot(page, "11-panel-hoy")
    page.goto(APP + "/panel/agenda")
    appt_day = sql("select (starts_at at time zone 'America/Havana')::date from appointments limit 1")
    page.locator("input[type=date]").fill(appt_day)
    page.get_by_role("button", name="Semana").click()
    page.get_by_text("Juan Pérez").first.wait_for()
    shot(page, "12-panel-agenda-semana")
    page.get_by_text("Juan Pérez").first.click()
    page.get_by_role("button", name="Confirmar").click()
    page.wait_for_timeout(800)
    assert sql("select status from appointments") == "confirmada", sql("select status from appointments")
    page.get_by_text("Juan Pérez").first.click()
    shot(page, "13-panel-detalle-cita")
    page.keyboard.press("Escape")
    page.goto(APP + "/panel/horario")
    page.get_by_text("Reglas de reserva").wait_for()
    shot(page, "14-panel-horario")
    page.goto(APP + "/panel/plan")
    page.get_by_text("1. Elige tu plan").wait_for()
    shot(page, "15-panel-plan")

    # 5. Fin de la prueba: app inhabilitada
    sql("update businesses set trial_ends_at = now() - interval '1 minute'")
    cp.goto(APP + "/barberia-leo")
    cp.get_by_text("no está recibiendo reservas").wait_for()
    shot(cp, "16-web-inhabilitada", full=False)
    page.goto(APP + "/panel")
    page.get_by_text("Activa tu app").wait_for()
    shot(page, "17-panel-bloqueado", full=False)

    # 6. Administrador activa el plan Plus
    admin = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="es-ES", timezone_id="America/Havana")
    admin.route("http://supa.test/**", handler)
    ap = admin.new_page()
    ap.on("pageerror", lambda e: errors.append("pageerror admin: " + str(e)))
    ap.goto(APP + "/entrar")
    ap.locator("input[type=email]").fill("osmel@test.com")
    ap.locator("input[type=password]").fill("x")
    ap.get_by_role("button", name="Entrar").click()
    ap.get_by_text("Ingreso mensual").wait_for()
    shot(ap, "18-admin-negocios")
    ap.get_by_role("button", name="Activar plan").click()
    ap.get_by_role("button", name="Plus").click()
    shot(ap, "19-admin-activar", full=False)
    ap.get_by_role("button", name="Confirmar pago y activar").click()
    ap.wait_for_timeout(1200)
    assert sql("select plan from businesses") == "plus"
    cp.goto(APP + "/barberia-leo")
    cp.get_by_role("link", name="Reservar cita").wait_for()
    page.goto(APP + "/panel")
    page.get_by_text("Citas de hoy").wait_for()
    print("Reactivado OK")
    ap.get_by_role("button", name="Ajustes").click()
    ap.get_by_text("Número de tarjeta").wait_for()
    shot(ap, "20-admin-ajustes")
    browser.close()

real = [e for e in errors if "favicon" not in e]
print("\nERRORES:" if real else "\nSIN ERRORES")
for e in real: print(" -", e)
