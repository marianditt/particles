from app.config.application_config import ApplicationConfig
from app.model.cloud import Cloud
from app.model.light import Light
from app.objective.cloud_state_factory import CloudStateFactory
from app.objective.light_state_factory import LightStateFactory
from app.objective.objective_factory import create_cloud_objective, create_light_objective
from app.particle_service import ParticleService
from app.particle_view import ParticleView
from optimization.monte_carlo_optimization import MonteCarloOptimization
from optimization.particle_swarm_optimization import ParticleSwarmOptimization
from view.viewer import Viewer


class ParticleApplication(object):
    def __init__(self, config: ApplicationConfig) -> None:
        def cloud_provider() -> Cloud:
            return self.__particle_service.cloud()

        def light_provider() -> Light:
            return self.__particle_service.light()

        cloud_objective = create_cloud_objective(light_provider, config.objective)
        cloud_state_factory = CloudStateFactory(config.state_factory)
        self.__cloud_algorithm = ParticleSwarmOptimization(cloud_objective, cloud_state_factory,
                                                           config.particle_swarm_optimization)

        light_objective = create_light_objective(cloud_provider, config.objective)
        light_state_factory = LightStateFactory(config.state_factory)
        light_algorithm = MonteCarloOptimization(light_objective, light_state_factory, config.monte_carlo_optimization)

        self.__particle_service = ParticleService(self.__cloud_algorithm, light_algorithm, config)
        self.__particle_view = ParticleView(self.__particle_service, Viewer(fps=20))

    def run(self) -> None:
        self.__particle_service.reset()
        while True:
            for _ in range(10):
                self.__particle_service.light_step()
                self.__particle_view.on_update()
            for _ in range(100):
                self.__cloud_algorithm.soft_reset()
                self.__particle_service.cloud_step()
                self.__particle_view.on_update()
