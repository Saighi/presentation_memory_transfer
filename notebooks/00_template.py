# %% [markdown]
# # NN: <title>
#
# Slide: <which slide this feeds>
# Output: slides/media/<kind>/<name>
#
# Copy this file to start a new visualization. Simulation logic comes from the
# paper repo (`prioritized_memory_transfer`, put on the path by `talkviz`); style
# and export from `talkviz`.

# %% Setup
import sys
from pathlib import Path

try:
    ROOT = Path(__file__).resolve().parents[1]
except NameError:  # interactive window without __file__
    ROOT = Path.cwd().parent if Path.cwd().name == "notebooks" else Path.cwd()
sys.path.insert(0, str(ROOT))

import numpy as np
import torch
import matplotlib.pyplot as plt

import talkviz as tv  # also puts the paper engine on sys.path
import prioritized_memory_transfer as pmt

tv.use_mpl_style()
P = tv.PALETTE

# %% Simulation

# %% Draft render (outputs/, not the deck)

# %% Final render (slides/media/)
