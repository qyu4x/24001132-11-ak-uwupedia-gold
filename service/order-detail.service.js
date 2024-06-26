const {OrdersDetails, Orders, Products, Logistics, Address, sequelize} = require('../model');
const {Op, where} = require('sequelize');
const {v4: uuidv4} = require('uuid');
const {validate} = require('../validation/validation');
const {ResponseError} = require('../error/response-error');
const orderStatus = require('../helper/order-status.helper');
const addressService = require('./address.service');
const productService = require('./product.service');
const {getOrderValidation} = require('../validation/order.validation');
const {getOrderDetailValidation, updateOrderStatusValidation} = require('../validation/order-detail.validation');
const {OrderDetailResponse} = require("../payload/response/order-detail.response");
const {SpecificOrderDetailResponse} = require("../payload/response/specific-order-detail.response");
const {AddressResponse} = require("../payload/response/address.response");
const {LogisticResponse} = require("../payload/response/logistic.response");
const {UserResponse} = require("../payload/response/user.response");
const {ProductResponse} = require("../payload/response/product.response");
const {CurrencyResponse} = require("../payload/response/currency.response");
const {formatCurrency} = require("../helper/i18n-currency.helper");
const {SimpleProductResponse} = require("../payload/response/simple-product.response");

const mapToOrderDetailResponse = (orderDetail) => {
    return new OrderDetailResponse(
        orderDetail.id,
        orderDetail.order_id,
        orderDetail.product_id,
        orderDetail.logistic_id,
        orderDetail.address_id,
        orderDetail.quantity,
        orderDetail.order_status,
        new CurrencyResponse(
            orderDetail.unit_price,
            formatCurrency(orderDetail.unit_price, 'id-ID', 'IDR', 'code'),
            formatCurrency(orderDetail.unit_price, 'id-ID', 'IDR', 'symbol')
        ),
        orderDetail.received_at,
        orderDetail.is_received,
        orderDetail.created_at,
        orderDetail.updated_at
    )
}

const mapToSpecificOrderDetailResponse = (orderDetail) => {
    return new SpecificOrderDetailResponse(
        orderDetail.id,
        orderDetail.order_id,
        new SimpleProductResponse(
            orderDetail.product.id,
            orderDetail.product.title,
            new CurrencyResponse(
                orderDetail.product.price,
                formatCurrency(orderDetail.product.price, 'id-ID', 'IDR', 'code'),
                formatCurrency(orderDetail.product.price, 'id-ID', 'IDR', 'symbol')
            )
        ),
        new LogisticResponse(
            orderDetail.logistic.id,
            orderDetail.logistic.name,
            new CurrencyResponse(
                orderDetail.logistic.payment_fees_permile,
                formatCurrency( orderDetail.logistic.payment_fees_permile, 'id-ID', 'IDR', 'code'),
                formatCurrency( orderDetail.logistic.payment_fees_permile, 'id-ID', 'IDR', 'symbol')
            ),
            orderDetail.logistic.logo_url,
            orderDetail.logistic.is_active,
            orderDetail.logistic.description,
            orderDetail.logistic.created_at,
            orderDetail.logistic.updated_at,
        ),
        new AddressResponse(
            orderDetail.address.id,
            orderDetail.address.name,
            orderDetail.address.phone_number,
            orderDetail.address.street,
            orderDetail.address.city,
            orderDetail.address.province,
            orderDetail.address.district,
            orderDetail.address.postal_code,
            orderDetail.address.is_main_address,
            orderDetail.address.is_active,
            orderDetail.address.created_at,
            orderDetail.address.updated_at,
        ),
        orderDetail.quantity,
        orderDetail.order_status,
        new CurrencyResponse(
            orderDetail.unit_price,
            formatCurrency(orderDetail.unit_price, 'id-ID', 'IDR', 'code'),
            formatCurrency(orderDetail.unit_price, 'id-ID', 'IDR', 'symbol')
        ),
        orderDetail.received_at,
        orderDetail.is_received,
        orderDetail.created_at,
        orderDetail.updated_at
    )
}

const create = async (userId, orderId, orderDetails) => {
    const tx = await sequelize.transaction();

    try {
        const addressPromises = orderDetails.map(orderDetail => {
            return addressService.get(userId, orderDetail.address_id);
        })

        await Promise.all(addressPromises);

        const productPromises = orderDetails.map(orderDetail => {
            productService.updateStock(orderDetail.product_id, orderDetail.quantity);
        })

        await Promise.all(productPromises);

        orderDetails.forEach(orderDetail => {
            orderDetail.id = uuidv4();
            orderDetail.order_id = orderId;
            orderDetail.order_status = orderStatus.awaiting_payment;
            orderDetail.is_received = false;
            orderDetail.created_at = Date.now();
        })

        console.log(orderDetails)
        await OrdersDetails.bulkCreate(orderDetails);

        tx.commit();
    } catch (error) {
        tx.rollback();
        throw new ResponseError(error.statusCode, error.message);
    }
}

const get = async (userId, orderId) => {
    orderId = validate(getOrderValidation, orderId);

    const orderDetails = await OrdersDetails.findAll({
        where: {
            order_id: orderId
        },
        include: {
            model: Orders,
            as: 'order',
            where: {
                user_id: userId
            },
            attributes: ['id']
        }
    })

    return orderDetails.map(orderDetail => mapToOrderDetailResponse(orderDetail));
}

const list = async (userId) => {
    const orderDetails = await OrdersDetails.findAll({
        include: {
            model: Orders,
            as: 'order',
            where: {
                user_id: userId
            },
            attributes: ['id']
        }
    })

    return orderDetails.map(orderDetail => mapToOrderDetailResponse(orderDetail));
}

const getSpecific = async (userId, orderId, orderDetailId) => {
    orderId = validate(getOrderValidation, orderId);
    orderDetailId = validate(getOrderDetailValidation, orderDetailId);

    const orderDetail = await OrdersDetails.findOne({
        where: {
            id: orderDetailId,
            order_id: orderId
        },
        include: [
            {
                model: Orders,
                as: 'order',
                where: {
                    user_id: userId
                },
                attributes: ['id']
            },
            {
                model: Products,
                as: 'product',
                attributes: ['id', 'title', 'price']
            },
            {
                model: Logistics,
                as: 'logistic'
            },
            {
                model: Address,
                as: 'address'
            },
        ],
    })

    return mapToSpecificOrderDetailResponse(orderDetail);
}

const updateOrderStatus = async (request, orderId, orderDetailId) => {
    const orderRequest = validate(updateOrderStatusValidation, request);
    orderId = validate(getOrderValidation, orderId);
    orderDetailId = validate(getOrderDetailValidation, orderDetailId);

    const orderDetail = await OrdersDetails.findOne({
            where: {
                id: orderDetailId,
                order_id: orderId
            }
        }
    )

    if (!orderDetail) {
        throw new ResponseError(404, 'Order detail not found');
    }

    orderDetail.order_status = orderRequest.order_status;
    orderDetail.updated_at = orderRequest.updated_at;

    await orderDetail.save();
}

const updateOrderStatusReceived = async (orderId, orderDetailId) => {
    orderId = validate(getOrderValidation, orderId);
    orderDetailId = validate(getOrderDetailValidation, orderDetailId);

    const orderDetail = await OrdersDetails.findOne({
            where: {
                id: orderDetailId,
                order_id: orderId
            }
        }
    )

    if (!orderDetail) {
        throw new ResponseError(404, 'Order detail not found');
    }

    orderDetail.is_received = true;
    orderDetail.received_at = Date.now();
    orderDetail.updated_at = Date.now();

    await orderDetail.save();
}


module.exports = {
    create,
    get,
    list,
    getSpecific,
    updateOrderStatus,
    updateOrderStatusReceived
}