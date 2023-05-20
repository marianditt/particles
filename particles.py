import logging
import sys

from app.config_loader import ConfigLoader
from app.particle_application import ParticleApplication


def main() -> None:
    logging.basicConfig(format='%(asctime)s [%(levelname)s] %(filename)s: %(message)s', level=logging.DEBUG)
    config = ConfigLoader.load_config(*sys.argv)
    ParticleApplication(config).run()


if __name__ == '__main__':
    main()
