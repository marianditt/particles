from typing import Tuple

import matplotlib.pyplot as plt

from view.fps_timer import FpsTimer

Point = Tuple[float, float]


class Viewer(object):
    def __init__(self, fps: float = 30) -> None:
        self.__fps_timer = FpsTimer(fps)
        self.__figure: plt.Figure = plt.figure()
        self.__axes: plt.Axes = self.__figure.gca()
        self.__axes.set_aspect('equal')

    def clear(self) -> None:
        self.__axes.clear()
        self.__fps_timer.reset()

    def draw_circle(self, center: Point, radius: float, color: str = 'k') -> None:
        self.__axes.add_patch(plt.Circle(center, radius, color=color, fill=False))

    def draw_line(self, p1: Point, p2: Point, color: str = 'k') -> None:
        self.__axes.plot([p1[0], p2[0]], [p1[1], p2[1]], color=color)

    def show(self) -> None:
        time_to_next_frame = self.__fps_timer.time_to_next_frame()
        self.__figure.waitforbuttonpress(time_to_next_frame)
        self.__fps_timer.reset()
