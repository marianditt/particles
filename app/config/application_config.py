from dataclasses import dataclass

from app.config.cloud_config import CloudConfig
from app.config.light_config import LightConfig
from app.config.objective_config import ObjectiveConfig
from app.config.state_factory_config import StateFactoryConfig
from optimization.gradient_descent import GradientDescentConfig
from optimization.monte_carlo_optimization import MonteCarloOptimizationConfig
from optimization.particle_swarm_optimization import ParticleSwarmOptimizationConfig
from optimization.simulated_annealing import SimulatedAnnealingConfig


@dataclass
class ApplicationConfig(object):
    max_iterations: int
    cloud: CloudConfig
    light: LightConfig
    state_factory: StateFactoryConfig
    objective: ObjectiveConfig
    gradient_descent: GradientDescentConfig
    monte_carlo_optimization: MonteCarloOptimizationConfig
    particle_swarm_optimization: ParticleSwarmOptimizationConfig
    simulated_annealing: SimulatedAnnealingConfig
