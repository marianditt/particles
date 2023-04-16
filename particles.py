import sys

from app.config_loader import ConfigLoader
from app.particle_application import ParticleApplication


def main() -> None:
    config = ConfigLoader.load_config(*sys.argv)
    ParticleApplication(config).run()


if __name__ == '__main__':
    main()
