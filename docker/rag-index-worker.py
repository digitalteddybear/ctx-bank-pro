import json
import signal
import sys
import time
from pathlib import Path
sys.path.insert(0, "/rag")
from rag_agent import build_embeddings
from crm_context import CrmIndex
from langchain_core.vectorstores import InMemoryVectorStore
running = True
def stop(*_):
    global running
    running = False
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
embeddings = build_embeddings()
index = CrmIndex(embeddings)
vectors = InMemoryVectorStore(embedding=embeddings)
heartbeat = Path("/data/rag-heartbeat")
while running:
    try:
        changed = index.refresh(vectors)
        heartbeat.write_text(str(time.time()))
        if changed:
            print(json.dumps({"service": "rag-index", "indexed": changed}), flush=True)
    except Exception as error:
        print(json.dumps({"service": "rag-index", "error": type(error).__name__}), flush=True)
    for _ in range(30):
        if not running:
            break
        time.sleep(1)
