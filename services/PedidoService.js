import { PedidoNotFound } from "../errors/PedidosErrors.js";
import { UsuarioNotExists } from "../errors/UsuariosErrors.js";
import { EstadoPedido } from "../models/entities/enums/EstadoPedido.js";
import { Pedido } from "../models/entities/Pedido.js";
import { PedidoOutputDTO } from "../models/entities/dtos/output/PedidoOutputDTO.js";
import { CancelationError, EntidadNotFoundError, NoPuedeEnviarseError } from "../errors/PedidosErrors.js";
import mongoose from "mongoose";
import { es } from "zod/v4/locales";
export class PedidoService {
    constructor(PedidoRepository,UsuariosRepository,ProductosRepository,NotificacionService) {
        this.pedidoRepository = PedidoRepository,
        this.usuariosRepository=UsuariosRepository,
        this.productosRepository=ProductosRepository;
        this.notificacionService=NotificacionService;
    }
    async obtenerPedidosPaginados(page, limit, filtros) {
        const numeroPagina = Math.max(Number(page),1);
        const elemPorPagina = Math.min(Math.max(Number(limit),1),100)// entre 1 y 100

        const pedidosPaginados = await this.pedidoRepository.findByPage(
            numeroPagina, elemPorPagina, filtros
        );
        if (!pedidosPaginados || pedidosPaginados.length === 0) {
            throw new PedidoNotFound('No se encontraron pedidos');
        }
        const total = await this.pedidoRepository.contarTodos(filtros);
        const totalPaginas = Math.ceil(total/elemPorPagina);

        return {
            pagina: numeroPagina,
            PorPagina: elemPorPagina,
            total: total,
            totalPaginas: totalPaginas,
            data: pedidosPaginados
        }

    }

    obtenerPedidoPorId = async (pedidoId) => {
        const pedido = await this.pedidoRepository.findById(pedidoId);
        if (!pedido) {
            throw new PedidoNotFound(`Pedido con id ${pedidoId} no encontrado`);
        }
        console.log("Pedido encontrado:", this.toOutputDTO(pedido));
        return this.toOutputDTO(pedido);
    }

    async crearPedido(pedidoInputDTO) {
        const usuario = await this.usuariosRepository.findById(pedidoInputDTO.compradorId);
        if (!usuario) {
            throw new UsuarioNotExists('El usuario comprador no existe');
        }
        for (const item of pedidoInputDTO.items) {
            const producto = await this.productosRepository.findById(item.productoId);
            if (!producto) {
                throw new EntidadNotFoundError("producto con id " + item.productoId + " no encontrado");
            }
            producto.estaDisponible(item.cantidad);
        }
        const nuevoPedido = new Pedido(usuario, pedidoInputDTO.items,
            pedidoInputDTO.moneda, pedidoInputDTO.direccionEntrega);
        nuevoPedido.agregarEstadoInicial(usuario);
        //ahora tendria que mapear el pedido para guardarlo
        const pedidoData = this.creacionToDB(nuevoPedido); 

        // se descuenta el stock de los productos del pedido
        for (const item of pedidoInputDTO.items) {
            const producto = await this.productosRepository.findById(item.productoId);
            
            producto.reducirStock(item.cantidad);

            await this.productosRepository.updateProducto(
                item.productoId,
                { stock: producto.stock }
            );
        }

        const pedidoGuardado = await this.pedidoRepository.save(pedidoData);
        
        await this.notificacionService.crearNotificacion(pedidoGuardado);
        
        return this.toOutputDTO(pedidoGuardado);
    
    }

    // tema a consultar, 
    // si conviene instanciar el pedido para poder usar sus metodos, 
    // o agregar los metodos al documento mongoose
    async cancelarPedido(pedidoId, motivo) {
        const lista = [EstadoPedido.CANCELADO, EstadoPedido.ENTREGADO, EstadoPedido.ENVIADO];
        const pedidoBase = await this.pedidoRepository.findById(pedidoId);
        if (!pedidoBase) {
            throw new PedidoNotFound();
        }
        
        const pedido = Pedido.fromDB(pedidoBase);

        if (lista.includes(pedido.estado)) {
            throw new CancelationError();
        }
        const compradorId = pedido.comprador._id.toString();
        const usuarioQueCancela = await this.usuariosRepository.findById(compradorId);
        // falta notif TODO

        // se aumenta el stock de los productos del pedido

        for (const item of pedidoBase.items) {
            // item.producto puede ser un ObjectId o un objeto con _id
            const productoId = item.producto._id.toString();
            const producto = await this.productosRepository.findById(productoId);

            producto.aumentarStock(item.cantidad);

            await this.productosRepository.updateProducto(
                productoId,
                {
                    stock: producto.stock,
                    ventas: producto.ventas
                }
            );
        }

        pedido.actualizarEstado(EstadoPedido.CANCELADO, usuarioQueCancela , motivo);

        const updateData = this.modifToDB(pedido);

        await this.pedidoRepository.update(pedidoBase._id, updateData);

        return this.toOutputDTO(updateData);
    }


    async marcarEnviado(pedidoId) {
        const pedidoBase = await this.pedidoRepository.findById(pedidoId);

        if (!pedidoBase) {
            throw new PedidoNotFound();
        }
        const lista = [EstadoPedido.CANCELADO, EstadoPedido.ENTREGADO, EstadoPedido.ENVIADO];

        if (lista.includes(pedidoBase.estado)) {
            throw new NoPuedeEnviarseError();
        }

        const pedido = Pedido.fromDB(pedidoBase);
        
        const usuarioQueEnvia = await this.usuariosRepository.findById(pedido.comprador);
        if (!usuarioQueEnvia) {
            throw new UsuarioNotExists('El usuario no existe');
        }

        // falta notificar al usuario que envía
        
        //const productos = pedido.items.map(item => item.producto);
        
        //productos.

        //se aumenta la cantidad vendida de cada producto

        for (const item of pedidoBase.items) {
            // item.producto puede ser un ObjectId o un objeto con _id
            const productoId = item.producto._id.toString();
            console.log("productoId:", productoId);

            const producto = await this.productosRepository.findById(productoId);

            if (!producto) {
                throw new EntidadNotFoundError(`Producto con id ${productoId} no encontrado`);
            }

            producto.aumentarVentas(item.cantidad);

            await this.productosRepository.updateProducto(
                productoId,
                { 
                    stock: producto.stock,
                    ventas: producto.ventas
                }
            );
        }

        pedido.actualizarEstado(EstadoPedido.ENVIADO, usuarioQueEnvia,null);

        const updateData = this.modifToDB(pedido);

        const updatePedido = await this.pedidoRepository.update(pedidoBase._id, updateData);

        await this.notificacionService.crearNotificacion(updatePedido);

        return this.toOutputDTO(updatePedido);
    }

    toOutputDTOs(pedidos){
        return pedidos.map(x=>this.toOutputDTO(x))
    }

    toOutputDTO(pedido) {
        return new PedidoOutputDTO(pedido);
    }

    /*
    marcarEnviado() {
        const estadosValidos = [EstadoPedido.CONFIRMADO, EstadoPedido.EN_PREPARACION];
        if (!estadosValidos.includes(this.estado)) {
        throw new Error('El pedido no puede ser marcado como enviado');
        }
        this.cambioDeEstado(EstadoPedido.ENVIADO);
        return console.log(`Pedido ${this.id} marcado como enviado`);
    }
*/
    modifToDB(pedido){
        return {
            estado: pedido.estado,
            historialEstados: pedido.historialEstados.map(ce => ({
                estado: ce.estado,
                usuarioId: ce.usuarioId ? ce.usuarioId.toString() : null,
                fecha: ce.fecha,
                motivo: ce.motivo
            })),
            total: pedido.total
        };
    }

    creacionToDB(nuevoPedido){
        return {
            comprador: nuevoPedido.comprador._id,
            items: nuevoPedido.items.map(item => ({
                producto: item.producto,
                cantidad: item.cantidad,
                precioUnitario: item.precioUnitario
            })),
            moneda: nuevoPedido.moneda,
            direccionEntrega: { ...nuevoPedido.direccionEntrega },
            estado: nuevoPedido.
            estado,
            fechaCreacion: nuevoPedido.fechaCreacion,
            historialEstados: nuevoPedido.historialEstados.map(ce => ({
                estado: ce.estado,
                usuario: ce.usuario._id || ce.usuario,
                fecha: ce.fecha,
                motivo: ce.motivo
            })),
            total: nuevoPedido.total
        };
    }
}