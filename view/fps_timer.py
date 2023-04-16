import logging
from time import time


class FpsTimer(object):
    MIN_TIME_TO_NEXT_FRAME = 1e-9

    def __init__(self, fps: float) -> None:
        self.__seconds_per_frame = 1.0 / fps
        self.__last_frame_timestamp = time()

    def time_to_next_frame(self) -> float:
        elapsed = time() - self.__last_frame_timestamp
        remaining = self.__seconds_per_frame - elapsed
        if remaining >= self.MIN_TIME_TO_NEXT_FRAME:
            return remaining
        else:
            logging.warning(f"Frame is lagging {abs(remaining):.2f}s behind.")
            return self.MIN_TIME_TO_NEXT_FRAME

    def reset(self) -> None:
        self.__last_frame_timestamp = time()
