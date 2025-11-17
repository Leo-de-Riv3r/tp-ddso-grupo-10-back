import { NotificacionUsuarioError } from "../errors/NotificacionesErrors.js";

export class NotificacionesController {

    constructor(notificacionService) {
        this.notificacionService = notificacionService;
    }

    /*
        De momento pasamos el USER como query param, explicacion de eze:
        
        "Respecto al user, no va a ser necesario pasarlo por parámetro pues lo tomaremos de otra forma;
        aunque por el momento lo pueden establecer así. Luego los ayudaremos a modificarlo."
    */
    async obtenerNotificaciones(req, res){
        try{
            const { usuario, leidas = true, page = 1, limit = 10 } = req.query;

            if(!usuario){
                throw new NotificacionUsuarioError()
            }
            const notificaciones = await this.notificacionService.obtenerNotificaciones(usuario, leidas, page, limit)

            res.status(200).json(notificaciones)
            return
        } catch (error) {
            res.status(error.statusCode).json({ error: error.message });
        }
    }

    async marcarNotificacionLeida(req, res){
        try {
            const notificacion = await this.notificacionService.marcarNotificacionLeida(req.params.id, req.query.usuario)

            res.status(201).json(notificacion)

            return
        } catch (error){
            res.status(error.statusCode).json({ error: error.message });
        }
    }



}