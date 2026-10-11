// utils/response.js — Standard JSON response helpers
function sendJSON(res, statusCode, data) {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
    });
    res.end(body);
}

function success(res, data = {}, message = 'Success', statusCode = 200) {
    sendJSON(res, statusCode, { success: true, message, data });
}

function error(res, message = 'An error occurred', statusCode = 500, errors = null) {
    const body = { success: false, message };
    if (errors) body.errors = errors;
    sendJSON(res, statusCode, body);
}

function notFound(res, message = 'Resource not found') {
    error(res, message, 404);
}

function unauthorized(res, message = 'Unauthorized access') {
    error(res, message, 401);
}

function forbidden(res, message = 'Access forbidden') {
    error(res, message, 403);
}

function badRequest(res, message = 'Bad request', errors = null) {
    error(res, message, 400, errors);
}

module.exports = { success, error, notFound, unauthorized, forbidden, badRequest };
