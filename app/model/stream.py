from typing import Generic, List, TypeVar

T = TypeVar('T')


class Stream(Generic[T]):
    def __init__(self, array: List[T]) -> None:
        self.__array = array
        self.__index = 0

    def is_done(self) -> bool:
        return self.__index == len(self.__array)

    def read(self) -> float:
        result = self.__array[self.__index]
        self.__index += 1
        return result

    def write(self, value: T) -> None:
        self.__array[self.__index] = value
        self.__index += 1
