from typing import Tuple, List

import matplotlib.pyplot as plt

from view.fps_timer import FpsTimer

Point = Tuple[float, float]


class Viewer(object):
    def __init__(self, fps: float = 30) -> None:
        self.__fps_timer = FpsTimer(fps)
        self.__figure: plt.Figure = plt.figure()
        self.__axes: plt.Axes = self.__figure.gca()
        self.__axes.set_aspect('equal')
        self.__z_order = 1

    def clear(self, width: float, height: float) -> None:
        self.__axes.clear()
        self.__axes.set_xlim(xmin=-0.5 * width, xmax=0.5 * width)
        self.__axes.set_ylim(ymin=-0.5 * height, ymax=0.5 * height)
        self.__fps_timer.reset()
        self.__z_order = 1

    def draw_disc(self, center: Point, radius: float, color: str = 'k') -> None:
        self.__axes.add_patch(plt.Circle(center, radius, color=color, fill=True, zorder=self.__z_order))
        self.__z_order += 1

    def draw_polygon(self, xy: List[Point], color: str = 'k') -> None:
        self.__axes.add_patch(plt.Polygon(xy, closed=True, color=color, zorder=self.__z_order))
        self.__z_order += 1

    def draw_line(self, p1: Point, p2: Point, color: str = 'k', width: float = 1) -> None:
        self.__axes.plot([p1[0], p2[0]], [p1[1], p2[1]], color=color, linewidth=width, zorder=self.__z_order)
        self.__z_order += 1

    def show(self) -> None:
        time_to_next_frame = self.__fps_timer.time_to_next_frame()
        self.__figure.waitforbuttonpress(time_to_next_frame)
        self.__fps_timer.reset()
