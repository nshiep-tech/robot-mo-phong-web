"""Chuyen bo nao .npz (tu train.py) sang .json de website doc. NGUYEN SY HIEP - ICTU
Dung: python tools/npz2json.py vao.npz ra.json "Ten hien thi" """
import json, sys, numpy as np
src, dst = sys.argv[1], sys.argv[2]
name = sys.argv[3] if len(sys.argv) > 3 else src
d = np.load(src)
k = lambda s: d[s].round(6).tolist()
out = {"format": "robot2wd-mlp-v1", "name": name, "obs_dim": 12, "act_dim": 2,
       "layers": [{"W": k("mlp_extractor_policy_net_0_weight"), "b": k("mlp_extractor_policy_net_0_bias"), "act": "tanh"},
                  {"W": k("mlp_extractor_policy_net_2_weight"), "b": k("mlp_extractor_policy_net_2_bias"), "act": "tanh"},
                  {"W": k("action_net_weight"), "b": k("action_net_bias"), "act": "clip"}]}
json.dump(out, open(dst, "w"), separators=(",", ":"))
print(dst, sum(len(l["b"]) for l in out["layers"]), "noron")
