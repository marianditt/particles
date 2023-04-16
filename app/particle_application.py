from app.config.particle_config import ParticleConfig
from app.particle_repository import ParticleRepository
from app.particle_service import ParticleService
from app.particle_view import ParticleView
from view.viewer import Viewer


class ParticleApplication(object):
    def __init__(self, config: ParticleConfig) -> None:
        self.__particle_repository = ParticleRepository()
        self.__particle_service = ParticleService(self.__particle_repository, config)
        self.__particle_view = ParticleView(self.__particle_service, Viewer())

    def run(self) -> None:
        self.__particle_service.make_random()
        while not self.__particle_service.is_done():
            self.__particle_service.step()
            self.__particle_view.on_update()
