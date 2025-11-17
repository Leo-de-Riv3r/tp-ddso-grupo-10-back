import mongoose from "mongoose"
import { ItemPedido } from '../entities/ItemPedido.js'
const itemPedidoSchema = new mongoose.Schema({
  producto: {
    type: mongoose.Schema.ObjectId,
    ref: 'Producto',
    required: true
  },
  cantidad: {
    type: Number,
    required: true
  },
  precioUnitario: {
    type: Number,
    required: true
  }
})
itemPedidoSchema.loadClass(ItemPedido)

const ItemProductoModel = mongoose.model('ItemPedido', itemPedidoSchema)
export default ItemProductoModel
export { itemPedidoSchema }
