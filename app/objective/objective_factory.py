import logging
import math
from typing import Callable

from app.config.objective_config import ObjectiveConfig
from app.model.cloud import Cloud
from app.model.light import Light
from app.model.stream import Stream
from app.objective.gap_utils import find_gaps
from optimization.optimization_algorithm import State

logger = logging.getLogger(__name__)

Objective = Callable[[State], float]
CloudProvider = Callable[[], Cloud]
LightProvider = Callable[[], Light]


def create_cloud_objective(light_provider: LightProvider, config: ObjectiveConfig) -> Objective:
    def avg_light_gap_regret(cloud: Cloud) -> float:
        critical_gaps = [gap.size for gap in find_gaps(cloud, light_provider()) if gap.size > 0]
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
        cloud = Cloud.from_stream(Stream(state.to_array()), config.cloud)
        return avg_light_gap_regret(cloud) + min_particle_distance_regret(cloud)

    return objective


def create_light_objective(cloud_provider: CloudProvider, config: ObjectiveConfig) -> Objective:
    def objective(state: State) -> float:
        cloud = cloud_provider()
        light = Light.from_stream(Stream(state.to_array()), config.light)
        return -max(gap.size for gap in find_gaps(cloud, light))

    return objective
