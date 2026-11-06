"""haiyue.mcr/1 -> the published 38x4x9 feature layout and 235-action mask."""
from collections import Counter
import numpy as np

OFFSETS = {'pass': 0, 'hu': 1, 'discard': 2, 'chow': 36, 'pung': 99, 'kong': 133, 'concealed-kong': 167, 'add-kong': 201}

def tile_id(value):
    if type(value) is not int or not 0 <= value < 34: raise ValueError('Tile must be 0..33')
    return value

def action_index(action):
    kind = action.get('type')
    if kind not in OFFSETS: raise ValueError('Unknown action')
    if kind in ('pass', 'hu'): return OFFSETS[kind]
    tile = tile_id(action.get('tile'))
    if kind == 'chow':
        tiles = sorted(tile_id(t) for t in action.get('tiles', []))
        if len(tiles) != 3 or tiles != list(range(tiles[0], tiles[0] + 3)) or tiles[-1] >= 27 or tiles[0] // 9 != tiles[-1] // 9 or tile not in tiles:
            raise ValueError('Invalid chow')
        return 36 + (tiles[0] // 9) * 21 + (tiles[0] % 9) * 3 + tile - tiles[0]
    return OFFSETS[kind] + tile

def encode(observation):
    o = observation
    if o.get('protocol') != 'haiyue.mcr/1': raise ValueError('Unsupported observation protocol')
    who, dealer, wind = o.get('seat'), o.get('dealer'), o.get('roundWind')
    if any(type(v) is not int or not 0 <= v < 4 for v in (who, dealer, wind)): raise ValueError('Invalid seat/wind')
    players, hand, actions = o.get('players'), o.get('hand'), o.get('legalActions')
    if not isinstance(players, list) or len(players) != 4 or any('hand' in p for p in players): raise ValueError('Expected four redacted players')
    if not isinstance(hand, list) or not 1 <= len(hand) <= 14: raise ValueError('Invalid own hand')
    if not isinstance(actions, list) or not 1 <= len(actions) <= 128: raise ValueError('No legal actions')
    obs = np.zeros((38, 36), dtype=np.float32)
    obs[0, 27 + (who - dealer) % 4] = 1
    obs[1, 27 + wind] = 1
    def thermometer(offset, tiles):
        for tile, count in Counter(tile_id(t) for t in tiles).items():
            if count > 4: raise ValueError('More than four copies')
            obs[offset:offset + count, tile] = 1
    thermometer(2, hand)
    # History includes discards claimed into melds; a current river alone loses those tiles.
    events = o.get('events', [])
    for seat, player in enumerate(players):
        relative = (seat - who) % 4
        discards = [e['tile'] for e in events if e.get('type') == 'discard' and e.get('seat') == seat and e.get('hand') == o.get('handIndex')]
        thermometer(6 + 4 * relative, discards)
        exposed = []
        for meld in player.get('melds', []):
            if meld.get('concealed') and seat != who: continue
            exposed.extend(t for t in meld.get('tiles', []) if t is not None)
        thermometer(22 + 4 * relative, exposed)
    indices = [action_index(a) for a in actions]
    if len(set(indices)) != len(indices): raise ValueError('Duplicate legal actions')
    mask = np.zeros(235, dtype=np.float32)
    mask[indices] = 1
    return obs.reshape(38, 4, 9), mask, indices
