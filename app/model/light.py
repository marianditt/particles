from dataclasses import dataclass
from typing import List

from app.model.ray import Ray


@dataclass
class Light(object):
    rays: List[Ray]
