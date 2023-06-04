import math
from dataclasses import dataclass
from typing import List

from app.model.cloud import Cloud
from app.model.light import Light


@dataclass
class Gap(object):
    rotation: float
    low_particle_index: int
    high_particle_index: int
    size: float


def rot_proj_x(a: float, x: float, y: float) -> float:
    return math.cos(a) * x - math.sin(a) * y


def find_ray_gaps(cloud: Cloud, ray: float) -> List[Gap]:
    rotation = ray - 0.5 * math.pi

    bbx = cloud.bounding_box
    b1 = rot_proj_x(-rotation, bbx.min_x, bbx.min_y)
    b2 = rot_proj_x(-rotation, bbx.min_x, bbx.max_y)
    b3 = rot_proj_x(-rotation, bbx.max_x, bbx.max_y)
    b4 = rot_proj_x(-rotation, bbx.max_x, bbx.min_y)
    bs = sorted((b1, b2, b3, b4))
    b_min = bs[1]
    b_max = bs[2]

    projections = [(rot_proj_x(-rotation, p.x, p.y), i) for i, p in enumerate(cloud.particles)]
    projections = sorted(projections, key=lambda projection: projection[0])

    gaps: List[Gap] = []
    for k in range(1, len(projections)):
        v1, i1 = projections[k - 1]
        v2, i2 = projections[k]

        v1 = min(max(v1, b_min), b_max)
        v2 = min(max(v2, b_min), b_max)
        gap = v2 - v1 - 2 * cloud.particle_radius
        gaps.append(Gap(rotation, i1, i2, gap))
    return gaps


def find_gaps(cloud: Cloud, light: Light) -> List[Gap]:
    return [gap for ray in light.rays for gap in find_ray_gaps(cloud, ray)]
