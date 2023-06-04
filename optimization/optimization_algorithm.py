from typing import Iterable, Iterator, List


class State(object):

    @staticmethod
    def gauss(mu: float, sigma: float, size: int) -> 'State':
        from random import gauss
        return State(gauss(mu, sigma) for _ in range(size))

    def __init__(self, values: Iterable[float]) -> None:
        self.__values = list(values)

    def to_array(self) -> List[float]:
        return self.__values

    def __iter__(self) -> Iterator[float]:
        return self.__values.__iter__()

    def __getitem__(self, index: int) -> float:
        return self.__values[index]

    def __setitem__(self, index: int, value: float) -> None:
        self.__values[index] = value

    def __len__(self) -> int:
        return len(self.__values)

    def __add__(self, other: 'State') -> 'State':
        return State(u + v for u, v in zip(self.__values, other.__values))

    def __sub__(self, other: 'State') -> 'State':
        return self + -other

    def __neg__(self) -> 'State':
        return -1.0 * self

    def __mul__(self, factor: float) -> 'State':
        return State(value * factor for value in self.__values)

    def __rmul__(self, factor: float) -> 'State':
        return self * factor

    def __truediv__(self, factor: float) -> 'State':
        return self * (1.0 / factor)


class OptimizationAlgorithm(object):
    def reset(self) -> None:
        raise NotImplementedError()

    def step(self) -> None:
        raise NotImplementedError()

    def best_state(self) -> State:
        raise NotImplementedError()
