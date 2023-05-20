from app.config.application_config import ApplicationConfig
from app.model.cloud import Cloud
from app.model.light import Light
from app.model.stream import Stream
from optimization.optimization_algorithm import OptimizationAlgorithm


class ParticleService:
    def __init__(self, cloud_algorithm: OptimizationAlgorithm, light_algorithm: OptimizationAlgorithm,
                 config: ApplicationConfig) -> None:
        self.__cloud_algorithm = cloud_algorithm
        self.__light_algorithm = light_algorithm
        self.__config = config

    def cloud(self) -> Cloud:
        stream = Stream(self.__cloud_algorithm.best_state())
        return Cloud.from_stream(stream, self.__config.cloud)

    def light(self) -> Light:
        stream = Stream(self.__light_algorithm.best_state())
        return Light.from_stream(stream, self.__config.light)

    def reset(self) -> None:
        self.__cloud_algorithm.reset()
        self.__light_algorithm.reset()

    def light_step(self) -> None:
        self.__light_algorithm.step()

    def cloud_step(self) -> None:
        self.__cloud_algorithm.step()
