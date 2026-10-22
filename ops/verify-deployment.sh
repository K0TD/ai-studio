#!/bin/sh
set -eu

echo "========================================================"
echo "AI Studio: Проверка готовности развертывания ai-studio.samx.pw"
echo "========================================================"

# 1. Проверка наличия .env
if [ ! -f ".env" ]; then
  echo "[-] ОШИБКА: Файл .env не найден в корне проекта."
  echo "    Скопируйте .env.production.example в .env и заполните секреты."
  exit 1
fi
echo "[+] Файл .env обнаружен."

# 2. Проверка прав доступа к .env
env_perms=$(stat -c "%a" .env 2>/dev/null || stat -f "%OLp" .env 2>/dev/null || echo "unknown")
if [ "$env_perms" != "600" ] && [ "$env_perms" != "400" ]; then
  echo "[!] ПРЕДУПРЕЖДЕНИЕ: Права на .env ($env_perms) рекомендуются 0600 (chmod 600 .env)."
else
  echo "[+] Права на .env корректны ($env_perms)."
fi

# 3. Валидация docker compose синтаксиса
echo "[*] Валидация docker compose конфигурации..."
docker compose --env-file .env config -q
echo "[+] Конфигурация docker-compose.yml валидна."

# 4. Проверка переменных окружения через preflight
echo "[*] Запуск preflight проверки приложения..."
docker compose run --rm --no-deps web bun run preflight
echo "[+] Preflight проверка приложения пройдена успешно."

# 5. Проверка статуса контейнеров (если запущены)
running_containers=$(docker compose ps -q 2>/dev/null | wc -l)
if [ "$running_containers" -gt 0 ]; then
  echo "[*] Обнаружены запущенные контейнеры. Проверка состояния..."
  docker compose ps

  # Проверка сетевой доступности health-эндпоинтов
  echo "[*] Проверка Liveness (/api/health/live)..."
  if curl -fsS --max-time 5 "http://127.0.0.1:3000/api/health/live" >/dev/null 2>&1; then
    echo "[+] Liveness (локальный порт 3000): OK"
  elif curl -fsS --max-time 5 "https://ai-studio.samx.pw/api/health/live" >/dev/null 2>&1; then
    echo "[+] Liveness (https://ai-studio.samx.pw): OK"
  else
    echo "[!] Не удалось достучаться до /api/health/live (возможно, контейнер еще запускается)."
  fi

  echo "[*] Проверка Readiness (/api/health/ready)..."
  if curl -fsS --max-time 8 "http://127.0.0.1:3000/api/health/ready" >/dev/null 2>&1; then
    echo "[+] Readiness (локальный порт 3000): OK (DB + Worker heartbeat активны)"
  elif curl -fsS --max-time 8 "https://ai-studio.samx.pw/api/health/ready" >/dev/null 2>&1; then
    echo "[+] Readiness (https://ai-studio.samx.pw): OK (DB + Worker heartbeat активны)"
  else
    echo "[!] /api/health/ready не вернул 200 OK. Проверьте логи: docker compose logs --tail=50 worker web"
  fi
else
  echo "[i] Контейнеры еще не запущены. Выполните шаги холодного пуска из плана."
fi

echo "========================================================"
echo "Проверка завершена."
echo "========================================================"
