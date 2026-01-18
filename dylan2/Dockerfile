FROM ruby:3.2-alpine

# Build-Dependencies + Runtime tools
RUN apk add --no-cache build-base bash cronie curl

WORKDIR /app

# Gems installieren
COPY Gemfile Gemfile.lock* ./
RUN bundle install

# App-Code kopieren
COPY . .

# Crontab installieren
RUN crontab /app/config/crontab

# Port 80 exponieren
EXPOSE 80

# Start script ausführen (startet Cron + Dylan Server)
CMD ["/app/scripts/start.sh"]
