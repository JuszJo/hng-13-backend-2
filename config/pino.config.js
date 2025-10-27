import { pinoHttp } from "pino-http";

const pinoLogger = pinoHttp({
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  serializers: {
    req(req) {
      const getClientIP = (req) => {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.ip || req.socket?.remoteAddress || 'unknown';
      };

      return {
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        ip: getClientIP(req)
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    }
  },
  customSuccessMessage: (req, res) => `Handled ${req.method} ${req.url} - ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `Error in ${req.method} ${req.url} - ${err.message}`,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) {
      return "error"
    }
    else if (res.statusCode >= 400) {
      return "warn"
    }
    else {
      return "info"
    }
  }
});

export { pinoLogger }