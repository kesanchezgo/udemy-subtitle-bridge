# -*- coding: utf-8 -*-
"""Prueba FSRS + presets (docs/STUDY_FLOW_PEDAGOGY.md, corregida en v1.5.3).

Colecciones LIMPIAS creadas con el backend real de Anki (pylib 25.9.5,
headless, sin tocar la colección del usuario) y el importador real:

  A. ¿El import trae los presets?
     A1: import SIN opciones  → esperado: preset NO creado, deck.conf → 1.
     A2: import con ImportAnkiPackageOptions(with_deck_configs=True)
         («Importar cualquier configuración del mazo») → esperado: preset
         «Udemy Bridge · Cursos» creado y el mazo apuntando a él (20/día).

  B. ¿FSRS es de la colección? (interruptor real, BoolKey::Fsrs)
     B1: tal cual llega A2, con col.get_config('fsrs', False) → False.
         Respondida una tarjeta nueva → memory_state None.
     B2: col.set_config('fsrs', True) → otra tarjeta nueva → memory_state
         PRESENTE. Si no lo está, el control no es válido y el script FALLA.
     B3: col.set_config('fsrs', False) → otra tarjeta nueva → None.

  C. Colección del usuario (copia de solo lectura): withDeckConfigs y fsrs
     recordados, y qué importador usa el add-on AnkiConnect.

Salida: tmp/fsrs-verdict.json + consola.
"""
import json
import os
import sys

VENV_SITE = os.path.expandvars(r'%LOCALAPPDATA%\AnkiProgramFiles\.venv\Lib\site-packages')
sys.path.insert(0, VENV_SITE)

from anki.collection import (  # noqa: E402
    Collection,
    ImportAnkiPackageOptions,
    ImportAnkiPackageRequest,
)
from anki.cards import Card  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APKG = os.path.join(REPO, 'tmp', 'qa-concept.apkg')
DECK_NAME = 'Kinema::Courses::USB QA — Curso de Prueba::01 — Lección de Prueba'
PRESET_NAME = 'Kinema · Cursos'


def fresh_collection(name: str) -> Collection:
    path = os.path.join(REPO, 'tmp', 'anki-fsrs-test', f'{name}.anki2')
    for f in (path, path + '-wal', path + '-shm'):
        if os.path.exists(f):
            os.remove(f)
    return Collection(path)


def memory_state_after_queue_answer(col: Collection, cid, ease=4):
    """Flujo oficial de cola: get_queued_cards lleva el contexto de estados."""
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


verdict = {}

# ── A1. Import sin opciones (lo que ocurre por defecto) ──────────────────────
col = fresh_collection('fsrs-a1')
col.import_anki_package(ImportAnkiPackageRequest(package_path=APKG))
deck = col.decks.by_name(DECK_NAME)
preset = next((c for c in col.decks.all_config() if PRESET_NAME in c.get('name', '')), None)
verdict['a1'] = {
    'preset_created': preset is not None,
    'deck_conf_points_to': deck['conf'],
}
print(f"A1. sin opciones → preset creado: {verdict['a1']['preset_created']}"
      f" · deck.conf → {verdict['a1']['deck_conf_points_to']}")
col.close()

# ── A2. Import con «Importar cualquier configuración del mazo» ───────────────
col = fresh_collection('fsrs-a2')
col.import_anki_package(ImportAnkiPackageRequest(
    package_path=APKG,
    options=ImportAnkiPackageOptions(with_deck_configs=True),
))
deck = col.decks.by_name(DECK_NAME)
preset = next((c for c in col.decks.all_config() if PRESET_NAME in c.get('name', '')), None)
verdict['a2'] = {
    'preset_created': preset is not None,
    'deck_conf_points_to': deck['conf'],
    'new_per_day': preset.get('new', {}).get('perDay') if preset else None,
}
print(f"A2. with_deck_configs=True → preset creado: {verdict['a2']['preset_created']}"
      f" · deck.conf → {verdict['a2']['deck_conf_points_to']}"
      f" · nuevas/día: {verdict['a2']['new_per_day']}")
assert preset is not None, 'A2: el preset debería existir con with_deck_configs=True'

# La cola del v3 solo mira el mazo seleccionado
col.decks.select(deck['id'])

# ── B. Interruptor real de colección (BoolKey::Fsrs) ─────────────────────────
cids = col.find_cards(f'deck:"{DECK_NAME}" is:new')

# B1. Tal cual llega la importación
verdict['b1'] = {'fsrs_collection': col.get_config('fsrs', False)}
ms, st = memory_state_after_queue_answer(col, cids[0])
verdict['b1']['memory_state'] = (
    {'stability': ms.stability, 'difficulty': ms.difficulty} if ms else None)
print(f"B1. fsrs colección={verdict['b1']['fsrs_collection']} → memory_state: {verdict['b1']['memory_state']}")

# B2. POSITIVO — obligatorio: col.set_config('fsrs', True) activa FSRS de verdad
col.set_config('fsrs', True)
ms, st = memory_state_after_queue_answer(col, cids[1])
verdict['b2'] = {'fsrs_collection': col.get_config('fsrs', True)}
verdict['b2']['memory_state'] = (
    {'stability': ms.stability, 'difficulty': ms.difficulty} if ms else None)
print(f"B2. fsrs colección=True → memory_state: {verdict['b2']['memory_state']}")
if verdict['b2']['memory_state'] is None:
    print('FALLO: el control positivo no produce memory_state — el control no es válido.')
    sys.exit(2)

# B3. NEGATIVO
col.set_config('fsrs', False)
ms, st = memory_state_after_queue_answer(col, cids[2])
verdict['b3'] = {'fsrs_collection': col.get_config('fsrs', False)}
verdict['b3']['memory_state'] = (
    {'stability': ms.stability, 'difficulty': ms.difficulty} if ms else None)
print(f"B3. fsrs colección=False → memory_state: {verdict['b3']['memory_state']}")

col.close()

# ── C. Colección del usuario (copia de solo lectura) + importador AnkiConnect ─
try:
    ucol = Collection(os.path.join(REPO, 'tmp', 'anki-fsrs-test', 'usercopy', 'collection.anki2'))
    verdict['user_collection'] = {
        'withDeckConfigs': ucol.get_config('withDeckConfigs', False),
        'fsrs': ucol.get_config('fsrs', False),
    }
    ucol.close()
except Exception as err:  # la copia puede no existir si alguien borra tmp/
    verdict['user_collection'] = {'error': str(err)}

addon_init = os.path.expandvars(r'%APPDATA%\Anki2\addons21\2055492159\__init__.py')
importer = 'desconocido'
try:
    with open(addon_init, encoding='utf-8') as f:
        src = f.read()
    if 'AnkiPackageImporter' in src:
        importer = 'AnkiPackageImporter (importador legacy: sí copia presets)'
    elif 'import_anki_package' in src:
        importer = 'import_anki_package (backend: presets solo con with_deck_configs)'
except OSError:
    pass
verdict['user_collection']['ankiconnect_importer'] = importer

# ── Veredicto ────────────────────────────────────────────────────────────────
verdict['verdict'] = {
    'import_activates_fsrs': False,
    'presets_require_import_option': (
        not verdict['a1']['preset_created'] and verdict['a2']['preset_created']),
    'fsrs_is_collection_wide': (
        verdict['b2']['memory_state'] is not None
        and verdict['b3']['memory_state'] is None),
}
print('\nVEREDICTO:')
for k, v in verdict['verdict'].items():
    print(f'  {k}: {v}')
print('  user_collection:', json.dumps(verdict['user_collection'], ensure_ascii=False))

out = os.path.join(REPO, 'tmp', 'fsrs-verdict.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(verdict, f, ensure_ascii=False, indent=2)
print('guardado en', out)
