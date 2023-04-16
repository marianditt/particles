from app.config.particle_config import ParticleConfig


class ConfigLoader(object):
    @staticmethod
    def load_config(*args: str) -> ParticleConfig:
        return ParticleConfig(10, 10, 1.0, 3.0, 100)
