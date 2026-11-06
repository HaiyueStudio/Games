import copy
import importlib.util
import json
from pathlib import Path
import sys
import threading
import types
import unittest
import urllib.error
import urllib.request
import numpy as np
from adapter import action_index, encode
from runtime import ModelRuntime
from server import create_server

ROOT = Path(__file__).resolve().parent

def observation():
    return {'protocol': 'haiyue.mcr/1', 'seat': 0, 'dealer': 0, 'roundWind': 1, 'revision': 1, 'handIndex': 4, 'phase': 'turn',
            'hand': [0, 0, 0, 1, 2, 3, 9, 10, 11, 18, 19, 20, 27, 27],
            'players': [{'name': str(i), 'melds': [], 'river': []} for i in range(4)], 'events': [],
            'legalActions': [{'type': 'discard', 'tile': t} for t in [0, 1, 2, 3, 9, 10, 11, 18, 19, 20, 27]]}

class AdapterTests(unittest.TestCase):
    def test_all_235_actions_match_the_published_space_without_collisions(self):
        actions = [{'type': 'pass'}, {'type': 'hu'}]
        for kind in ['discard', 'pung', 'kong', 'concealed-kong', 'add-kong']:
            actions.extend({'type': kind, 'tile': t} for t in range(34))
        for suit in range(3):
            for start in range(7):
                tiles = [suit * 9 + start + i for i in range(3)]
                actions.extend({'type': 'chow', 'tile': t, 'tiles': tiles} for t in tiles)
        self.assertEqual(sorted(map(action_index, actions)), list(range(235)))
        with self.assertRaises(ValueError): action_index({'type': 'chow', 'tile': 8, 'tiles': [8, 9, 10]})
    def test_reference_feature_parity_and_claimed_discard_history(self):
        agent = types.ModuleType('agent'); agent.MahjongGBAgent = object
        fan = types.ModuleType('MahjongGB'); fan.MahjongFanCalculator = lambda **kw: []
        sys.modules.update(agent=agent, MahjongGB=fan)
        spec = importlib.util.spec_from_file_location('feature_reference', ROOT / 'vendor/feature_reference.py')
        reference = importlib.util.module_from_spec(spec); spec.loader.exec_module(reference)
        o = observation(); o['seat'] = 2; o['dealer'] = 1
        o['players'][0]['melds'] = [{'kind': 'chow', 'tiles': [3, 4, 5], 'concealed': False}]
        o['players'][2]['melds'] = [{'kind': 'kong', 'tiles': [31] * 4, 'concealed': True}]
        o['players'][3]['melds'] = [{'kind': 'kong', 'tiles': [None] * 4, 'concealed': True}]
        o['events'] = [{'type': 'discard', 'seat': 1, 'hand': 4, 'tile': 4}]
        ref = reference.FeatureAgent(1); ref.request2obs('Wind 1')
        names = reference.FeatureAgent.TILE_LIST
        ref.hand = [names[t] for t in o['hand']]
        ref.history[3] = [names[4]]
        ref.packs[2] = [('CHI', names[4], 1)]
        ref.packs[0] = [('GANG', names[31], 0)]
        ref.packs[1] = [('GANG', 'CONCEALED', 0)]
        ref._hand_embedding_update()
        features, mask, indices = encode(o)
        np.testing.assert_array_equal(features, ref.obs.reshape(38, 4, 9))
        self.assertEqual(features[18].reshape(36)[4], 1)  # seat 1 relative to seat 2
        changed = copy.deepcopy(o); changed['players'][3]['melds'][0]['tiles'] = [33] * 4
        np.testing.assert_array_equal(features, encode(changed)[0])
        self.assertEqual(int(mask.sum()), len(indices))
    def test_private_opponent_hands_and_duplicate_masks_are_rejected(self):
        o = observation(); o['players'][1]['hand'] = [31]
        with self.assertRaises(ValueError): encode(o)
        o = observation(); o['legalActions'] *= 2
        with self.assertRaises(ValueError): encode(o)

class RealWeightsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.runtime = ModelRuntime(ROOT / 'weights')
    def test_all_pretrained_profiles_choose_only_referee_actions(self):
        o = observation(); self.assertTrue(all(m['available'] for m in self.runtime.catalog()))
        for model in ['kd-s0', 'kd-s1', 'kd-s2', 'kdens3']:
            response = self.runtime.decide(model, {'protocol': o['protocol'], 'requestId': 'weight-check', 'observation': o})
            self.assertIn(response['action'], o['legalActions']); self.assertEqual(response['revision'], o['revision'])
            self.assertEqual(response['weightsRevision'], '5670a37c87890ffe95ea0cc0431cb1c704ec8564')
    def test_parameters_are_reproducible_and_invalid_parameters_fail(self):
        request = {'protocol': 'haiyue.mcr/1', 'requestId': 'params', 'observation': observation(), 'parameters': {'temperature': 1, 'seed': 42}}
        first = self.runtime.decide('kd-s0', request); second = self.runtime.decide('kd-s0', request)
        self.assertEqual(first['action'], second['action'])
        request['parameters']['temperature'] = -1
        with self.assertRaises(ValueError): self.runtime.decide('kd-s0', request)

class HttpTests(unittest.TestCase):
    def test_discovery_cors_and_model_request_contract(self):
        server = create_server('127.0.0.1', 0, ROOT / 'weights')
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            with urllib.request.urlopen(base + '/models') as response:
                self.assertEqual(len(json.load(response)['models']), 4)
            request = urllib.request.Request(base + '/models', headers={'Origin': 'https://example.com'})
            with self.assertRaises(urllib.error.HTTPError) as error: urllib.request.urlopen(request)
            self.assertEqual(error.exception.code, 403)
            body = json.dumps({'protocol': 'haiyue.mcr/1', 'requestId': 'http-check', 'observation': observation()}).encode()
            request = urllib.request.Request(base + '/agent/kd-s0', data=body, headers={'Content-Type': 'application/json', 'Origin': 'http://localhost:3000'})
            with urllib.request.urlopen(request) as response:
                self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'http://localhost:3000')
                self.assertEqual(json.load(response)['requestId'], 'http-check')
        finally:
            server.shutdown(); server.server_close(); thread.join()

if __name__ == '__main__': unittest.main()
