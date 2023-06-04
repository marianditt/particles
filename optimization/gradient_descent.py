from dataclasses import dataclass
from typing import Callable

from optimization.optimization_algorithm import OptimizationAlgorithm, State
from optimization.state_factory import StateFactory

Objective = Callable[[State], float]
Gradient = Callable[[State], State]


@dataclass
class GradientDescentConfig(object):
    initial_step_size: float
    grow_factor: float
    shrink_factor: float
    min_step_size: float


class GradientDescent(OptimizationAlgorithm):
    def __init__(self, objective: Objective, gradient: Gradient, state_factory: StateFactory,
                 config: GradientDescentConfig) -> None:
        self.__objective = objective
        self.__gradient = gradient
        self.__state_factory = state_factory
        self.__config = config

        self.__state = State([])
        self.__step_size = 0.0
        self.reset()

    def reset(self) -> None:
        self.__state = self.__state_factory.create_state()
        self.__step_size = self.__config.initial_step_size

    def step(self) -> None:
        current_value = self.__objective(self.__state)
        step = self.__gradient(self.__state)
        while self.__step_size >= self.__config.min_step_size:
            next_state = self.__state - self.__step_size * step
            next_value = self.__objective(next_state)
            if next_value < current_value:
                self.__state = next_state
                self.__step_size *= self.__config.grow_factor
                return
            else:
                self.__step_size *= self.__config.shrink_factor

    def best_state(self) -> State:
        return self.__state
