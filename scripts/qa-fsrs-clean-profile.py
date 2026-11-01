# -*- coding: utf-8 -*-
"""Prueba decisiva FSRS (docs/STUDY_FLOW_PEDAGOGY.md, pendiente manual).

Colección LIMPIA creada con el backend real de Anki (pylib 25.9.5, sin GUI
y sin tocar la colección del usuario) + el importador real:

  A. ¿Qué trae la importación de nuestro .apkg? (preset y campo fsrs)
  B. ¿Activa FSRS? (memory_state tras responder, contra control con el
     flag apagado y con el flag puesto a mano)

Salida: tmp/fsrs-verdict.json + consola.
"""
import json
import os
import sys

VENV_SITE = os.path.expandvars(r'%LOCALAPPDATA%\AnkiProgramFiles\.venv\Lib\site-packages')
sys.path.insert(0, VENV_SITE)

from anki.collection import Collection, ImportAnkiPackageRequest  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLEAN = os.path.join(REPO, 'tmp', 'anki-fsrs-test', 'clean-collection.anki2')
APKG = os.path.join(REPO, 'tmp', 'qa-concept.apkg')
DECK_NAME = 'Kinema::Courses::USB QA — Curso de Prueba::01 — Lección de Prueba'
PRESET_NAME = 'Udemy Bridge · Cursos'

for f in (CLEAN, CLEAN + '-wal', CLEAN + '-shm'):
    if os.path.exists(f):
        os.remove(f)

verdict = {}
col = Collection(CLEAN)

# ── A. Qué trae la importación ────────────────────────────────────────────────
default_conf = next(c for c in col.decks.all_config() if c['id'] == 1)
verdict['default'] = {
    'fsrs_present': 'fsrs' in default_conf,
    'fsrs_value': default_conf.get('fsrs', '(ausente)'),
}
print(f"preset Default de la colección limpia → clave 'fsrs': {verdict['default']['fsrs_value']}")
col.import_anki_package(ImportAnkiPackageRequest(package_path=APKG))
imported_conf = next(
    (c for c in col.decks.all_config() if PRESET_NAME in c.get('name', '')),
    None,
)
deck = col.decks.by_name(DECK_NAME)
verdict['imported'] = {
    'preset_created': imported_conf is not None,
    'deck_conf_points_to': deck['conf'],
    'fsrs_present': 'fsrs' in imported_conf if imported_conf else None,
    'fsrs_value': imported_conf.get('fsrs', '(ausente)') if imported_conf else None,
    'new_per_day': (imported_conf or default_conf).get('new', {}).get('perDay'),
}
print(f"A. preset creado: {verdict['imported']['preset_created']}"
      f" · deck.conf → {verdict['imported']['deck_conf_points_to']}"
      f" · fsrs: {verdict['imported']['fsrs_value']}"
      f" · nuevas/día: {verdict['imported']['new_per_day']}")

# La cola del v3 solo mira el mazo seleccionado
col.decks.select(deck['id'])

# ── B. Comportamiento ────────────────────────────────────────────────────────
def memory_state_after_good(cid, ease=4):
    # Flujo oficial: la cola del backend lleva el contexto de estados; si el
    # cid no es el primero en cola, se descarta la de delante (Again) hasta
    # llegar a él.
    from anki.cards import Card
    for _ in range(60):
        q = col.sched.get_queued_cards()
        if not q.cards:
            break
        card = Card(col)
        card._load_from_backend_card(q.cards[0].card)
        card.start_timer()
        if card.id == cid:
            col.sched.answerCard(card, ease)
            break
        col.sched.answerCard(card, 1)  # Again: aparta la que no toca
    after = col.get_card(cid)
    return getattr(after, 'memory_state', None), (after.type, after.queue, after.ivl)

cids = col.find_cards(f'deck:"{DECK_NAME}" is:new')

# B1. Tal cual llega la importación (deck → Default, SM-2)
ms, st = memory_state_after_good(cids[0])
verdict['as_imported'] = {
    'memory_state': ({'stability': ms.stability, 'difficulty': ms.difficulty} if ms else None),
    'fsrs_active': ms is not None,
    'card_state': st,
}
print(f"B1. importado sin preset → type/queue/ivl {st} → memory_state: {verdict['as_imported']['memory_state']}")

# B2. Control positivo: preset propio con fsrs=true (lo que el .apkg INTENTABA traer)
existing_ids = [c['id'] for c in col.decks.all_config()]
custom = dict(default_conf)
custom['id'] = max(existing_ids) + 1
custom['name'] = PRESET_NAME
custom['fsrs'] = True
# Réplica EXACTA de lo que escribe Anki al activar FSRS desde la UI:
# pesos vacíos (usa los parámetros por defecto) junto al interruptor.
custom['fsrsWeights'] = []
custom['fsrsParams5'] = []
custom['fsrsParams6'] = []
col.decks.save(custom)
assert custom['id'] in [c['id'] for c in col.decks.all_config()], 'el preset de control no se creó'
deck['conf'] = custom['id']
col.decks.save(deck)
print(f"   (preset de control creado: id={custom['id']}, fsrs={custom['fsrs']})")
ms, st = memory_state_after_good(cids[1])
verdict['forced_true'] = {
    'memory_state': ({'stability': ms.stability, 'difficulty': ms.difficulty} if ms else None),
    'fsrs_active': ms is not None,
    'card_state': st,
}
print(f"B2. preset con fsrs=true → type/queue/ivl {st} → memory_state: {verdict['forced_true']['memory_state']}")

# B3. Control negativo: el mismo preset con fsrs=false
custom['fsrs'] = False
col.decks.save(custom)
ms, st = memory_state_after_good(cids[2])
verdict['forced_false'] = {
    'memory_state': ({'stability': ms.stability, 'difficulty': ms.difficulty} if ms else None),
    'fsrs_active': ms is not None,
    'card_state': st,
}
print(f"B3. preset con fsrs=false → type/queue/ivl {st} → memory_state: {verdict['forced_false']['memory_state']}")

col.close()

verdict['verdict'] = {
    'import_activates_fsrs': verdict['as_imported']['fsrs_active'],
    'flag_honored_when_present': verdict['forced_true']['fsrs_active'] and not verdict['forced_false']['fsrs_active'],
}
print('\nVEREDICTO:')
print('  ¿El import activa FSRS en colección limpia?', verdict['verdict']['import_activates_fsrs'])
print('  ¿El planificador respeta el flag cuando el preset existe?', verdict['verdict']['flag_honored_when_present'])

out = os.path.join(REPO, 'tmp', 'fsrs-verdict.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(verdict, f, ensure_ascii=False, indent=2)
print('guardado en', out)
