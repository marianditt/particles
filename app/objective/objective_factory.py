import logging
import math
from dataclasses import dataclass
from typing import Callable, List

from app.config.objective_config import ObjectiveConfig
from app.model.cloud import Cloud
from app.model.light import Light
from app.model.stream import Stream
from optimization.gradient_descent import Gradient

logger = logging.getLogger(__name__)

State = List[float]
Objective = Callable[[State], float]
CloudProvider = Callable[[], Cloud]
LightProvider = Callable[[], Light]


@dataclass
class Gap(object):
    rotation: float
    low_particle_index: int
    high_particle_index: int
    size: float


def find_gaps(cloud: Cloud, light: Light) -> List[Gap]:
    rotations = [ray - 0.5 * math.pi for ray in light.rays]
    gaps: List[Gap] = []
    for rotation in rotations:
        projections = [math.cos(-rotation) * p.x - math.sin(-rotation) * p.y for p in cloud.particles]
        idx_map = sorted(range(len(cloud.particles)), key=lambda i: projections[i])
        for k in range(1, len(projections)):
            gap = projections[idx_map[k]] - projections[idx_map[k - 1]]
            gaps.append(Gap(rotation, idx_map[k - 1], idx_map[k], gap))
    return gaps


def create_cloud_objective(light_provider: LightProvider, config: ObjectiveConfig) -> Objective:
    def max_light_gap_regret(cloud: Cloud) -> float:
        particle_coverage = 2.0 * cloud.particle_radius
        critical_gaps = [gap.size - particle_coverage for gap in find_gaps(cloud, light_provider())
                         if gap.size > particle_coverage]
        return max(critical_gaps, default=0.0)

    def min_particle_distance_regret(cloud: Cloud) -> float:
        min_distance = 2 * cloud.particle_radius + config.min_gap
        regret = 0.0
        for i in range(len(cloud.particles)):
            for j in range(i + 1, len(cloud.particles)):
                difference = cloud.particles[j] - cloud.particles[i]
                distance = math.sqrt(difference.dot(difference))
                regret = max(min_distance - distance, regret)
        return regret

    def objective(state: State) -> float:
        cloud = Cloud.from_stream(Stream(state), config.cloud)
        return max_light_gap_regret(cloud) + min_particle_distance_regret(cloud)

    return objective


def create_cloud_gradient(light_provider: LightProvider, config: ObjectiveConfig) -> Gradient:
    def max_light_gap(cloud: Cloud) -> State:
        raise NotImplementedError()

    def min_particle_distance(cloud: Cloud) -> State:
        gradient: State = []
        particles = cloud.particles
        # TODO implement
        return gradient

    def gradient(state: State) -> State:
        cloud = Cloud.from_stream(Stream(state), config.cloud)
        return [g1 + g2 for g1, g2 in zip(max_light_gap(cloud), min_particle_distance(cloud))]

    return gradient


def create_light_objective(cloud_provider: CloudProvider, config: ObjectiveConfig) -> Objective:
    def objective(state: State) -> float:
        cloud = cloud_provider()
        light = Light.from_stream(Stream(state), config.light)
        return -max(gap.size for gap in find_gaps(cloud, light))

    return objective
