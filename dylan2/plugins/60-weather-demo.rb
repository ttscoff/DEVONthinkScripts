# frozen_string_literal: true

require 'net/http'
require 'json'

# Weather Demo Plugin
# Zeigt wie externe API-Calls funktionieren (parallel dank Async!)
#
# Beispiel: /weather/Berlin
#
# WICHTIG: In Produktion würde man async-http für API-Calls nutzen,
# aber Net::HTTP funktioniert auch (Async gibt Kontrolle ab während I/O)

class WeatherDemoPlugin < Dylan::Plugin
  pattern(%r{^/weather/(.+)$})

  def call(host, path, request)
    match = path.match(%r{^/weather/(.+)$})
    city = match[1]

    # Demo: Simuliere langsamen API-Call (2 Sekunden)
    # In echt würde hier ein HTTP-Request zu einer Weather-API laufen
    sleep 2

    # Fake-Daten zurück
    data = {
      city: city,
      temperature: rand(15..25),
      condition: ['Sunny', 'Cloudy', 'Rainy'].sample,
      timestamp: Time.now.iso8601,
      note: "This is a demo. Real plugin would call weather API."
    }

    Dylan::Response.json(data)
  end
end
