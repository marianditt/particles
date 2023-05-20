from app.config.state_factory_config import StateFactoryConfig
from optimization.optimization_algorithm import State
from optimization.state_factory import StateFactory


class LightStateFactory(StateFactory):
    def __init__(self, config: StateFactoryConfig) -> None:
        self.__config = config

    def create_state(self) -> State:
        from app.model.light import Light
        return Light(0.0, self.__config.light).to_array()
