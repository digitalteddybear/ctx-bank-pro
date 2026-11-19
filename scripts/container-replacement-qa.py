"""Exercise fresh web and worker containers against a dedicated disposable volume."""
import os
import subprocess
import time
import uuid

name = "ctx-replacement-" + uuid.uuid4().hex
volume = name + "-data"
image = os.environ.get("CTX_QA_IMAGE", "ctx-app:local")
web, worker = name + "-web", name + "-worker"


def docker(*args):
    return subprocess.check_output(["docker", *args], stderr=subprocess.STDOUT, text=True, timeout=90).strip()


def wait_for(container, expression):
    for _ in range(50):
        try:
            return docker("exec", container, "node", "--input-type=module", "-e", expression)
        except subprocess.CalledProcessError:
            time.sleep(0.3)
    raise RuntimeError("Container verification failed: " + docker("logs", "--tail", "6", container))


def start(container, *command):
    return docker("run", "-d", "--name", container, "--network", "none",
                  "-v", volume + ":/data",
                  "-e", "CTX_OUTREACH_DB_PATH=/data/outreach/workflows.sqlite",
                  "-e", "CTX_WORKER_MODE=external", "-e", "CTX_LIVE_EMAIL_DISPATCH=false",
                  "-e", "HUBSPOT_WRITES_ENABLED=false", image, *command)


ready = "if(!(await fetch('http://127.0.0.1:3000/api/ready')).ok)process.exit(1)"
db = "import {DatabaseSync} from 'node:sqlite'; const db=new DatabaseSync(process.env.CTX_OUTREACH_DB_PATH);"
heartbeat = db + """const row=db.prepare("SELECT value FROM settings WHERE key='worker-heartbeat'").get();
if(!(Number(row?.value)>Number(process.argv[1]||0)))process.exit(1);console.log(row.value);"""
docker("volume", "create", volume)
try:
    original_web = start(web, "npm", "start")
    wait_for(web, ready)
    original_worker = start(worker, "node", "--import", "tsx", "scripts/outreach-service.ts")
    first = next(line for line in wait_for(worker, heartbeat).splitlines() if line.isdigit())
    docker("restart", "-t", "1", web)
    wait_for(web, ready)
    wait_for(worker, heartbeat.replace("Number(process.argv[1]||0)", first))
    assert docker("inspect", "--format", "{{.Id}}", worker) == original_worker
    docker("rm", "-f", worker)
    docker("exec", web, "node", "--import", "tsx", "--input-type=module", "-e", """
import {OutreachStore} from './src/lib/server/outreach/store.ts';
import {FixtureModel} from './src/lib/server/outreach/models.ts';
import {OutreachEngine} from './src/lib/server/outreach/engine.ts';
import {saveReplyTemplate} from './src/lib/server/outreach/reply-template-store.ts';
const s=new OutreachStore(process.env.CTX_OUTREACH_DB_PATH);
saveReplyTemplate(s,'campaign','<p>{{message}}</p>');
const run=new OutreachEngine(s,new FixtureModel()).create({id:'demo',email:'demo@example.test',name:'Recovery Test',facts:[],permission:'granted'});
s.setSetting('qa-recovery-run',run.id);
if(!s.db.prepare("SELECT id FROM jobs WHERE state='queued' AND run_id=?").get(run.id))throw Error('Missing queued job');
s.close();
""")
    docker("rm", "-f", web)
    assert start(web, "npm", "start") != original_web
    wait_for(web, ready)
    assert start(worker, "node", "--import", "tsx", "scripts/outreach-service.ts") != original_worker
    wait_for(worker, heartbeat.replace("Number(process.argv[1]||0)", first))
    wait_for(web, db + """
const id=db.prepare("SELECT value FROM settings WHERE key='qa-recovery-run'").get().value;
if(!db.prepare("SELECT id FROM jobs WHERE state='done' AND run_id=?").get(id))process.exit(1);
""")
    docker("exec", web, "node", "--import", "tsx", "--input-type=module", "-e", """
import {OutreachStore} from './src/lib/server/outreach/store.ts';
import {readReplyTemplate} from './src/lib/server/outreach/reply-template-store.ts';
const s=new OutreachStore(process.env.CTX_OUTREACH_DB_PATH);
if(readReplyTemplate(s,'campaign').template!=='<p>{{message}}</p>'||s.list().length!==1)process.exit(1);
s.close();
""")
    print("Replacement web ready; replacement worker advanced queued run; template persisted.")
finally:
    for container in (worker, web):
        subprocess.run(["docker", "rm", "-f", container], capture_output=True)
    docker("volume", "rm", volume)
