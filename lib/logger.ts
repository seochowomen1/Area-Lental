/**
 * 구조화된 로깅 유틸리티
 * 
 * 개발 환경에서는 읽기 쉬운 형태로 출력
 * 프로덕션에서는 JSON 형태로 출력하여 로그 수집 도구와 연동 가능
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  userId?: string;
  requestId?: string;
  roomId?: string;
  [key: string]: unknown;
}

class Logger {
  private isDev = process.env.NODE_ENV === 'development';

  private log(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...context,
    };

    if (this.isDev) {
      // 개발 환경: 콘솔에 읽기 쉬운 형태로 출력
      const emoji = {
        debug: '🔍',
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
      }[level];
      
      console.log(`${emoji} [${level.toUpperCase()}] ${message}`);
      if (context && Object.keys(context).length > 0) {
        console.log('  Context:', context);
      }
    } else {
      // 프로덕션: JSON 형태로 출력 (로그 수집 도구 연동용)
      console.log(JSON.stringify(logEntry));
    }
  }

  debug(message: string, context?: LogContext) {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext) {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext) {
    this.log('error', message, context);
  }

  /**
   * 민감 정보를 로그에서 제거
   */
  sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const sensitive = [
      'password', 'token', 'secret', 'birth', 'privateKey',
      'email', 'phone', 'applicantName', 'address',
      'SMTP_PASS', 'ADMIN_PASSWORD', 'GOOGLE_SERVICE_ACCOUNT_JSON',
    ];
    const sanitized = { ...data };

    for (const key of sensitive) {
      if (sanitized[key] && typeof sanitized[key] === 'string') {
        const val = sanitized[key] as string;
        if (key === 'email' && val.includes('@')) {
          sanitized[key] = val[0] + '***@' + val.split('@')[1];
        } else {
          sanitized[key] = '***';
        }
      }
    }

    return sanitized;
  }
}

export const logger = new Logger();
