import math

from app.config.application_config import ApplicationConfig
from app.config.cloud_config import CloudConfig
from app.config.light_config import LightConfig
from app.config.objective_config import ObjectiveConfig
from app.config.state_factory_config import StateFactoryConfig
from optimization.gradient_descent import GradientDescentConfig
from optimization.monte_carlo_optimization import MonteCarloOptimizationConfig
from optimization.optimization_algorithm import State
from optimization.particle_swarm_optimization import ParticleSwarmOptimizationConfig
from optimization.simulated_annealing import SimulatedAnnealingConfig


class ConfigLoader(object):
    @staticmethod
    def load_config(*args: str) -> ApplicationConfig:
        num_rays = 4

        cloud = CloudConfig(
            num_particles=7,
            num_instances=7,
            particle_radius=1.0
        )

        light = LightConfig(
            num_rays=num_rays
        )

        state_factory = StateFactoryConfig(
            std_spread_x=8.0,
            std_spread_y=10.0,
            max_period=20.0,
            cloud=cloud,
            light=light
        )

        objective = ObjectiveConfig(
            min_gap=1.0,
            cloud=cloud,
            light=light
        )

        gradient_descent = GradientDescentConfig(
            initial_step_size=0.01,
            grow_factor=1.5,
            shrink_factor=0.5,
            min_step_size=1e-20
        )

        monte_carlo_optimization = MonteCarloOptimizationConfig(
            num_iterations_per_step=10,
            ranges=State([math.pi / num_rays])
        )

        particle_swarm_optimization = ParticleSwarmOptimizationConfig(
            num_particles=100,
            std_initial_velocity=0.001,
            momentum=0.8,
            perception=0.4,
            social=0.4,
            max_velocity=0.1
        )

        simulated_annealing = SimulatedAnnealingConfig(
            std_step_size=0.1,
            num_iterations=int(1000),
            max_temperature=10,
        )

        return ApplicationConfig(
            max_iterations=100,
            cloud=cloud,
            light=light,
            state_factory=state_factory,
            objective=objective,
            gradient_descent=gradient_descent,
            monte_carlo_optimization=monte_carlo_optimization,
            simulated_annealing=simulated_annealing,
            particle_swarm_optimization=particle_swarm_optimization
        )
