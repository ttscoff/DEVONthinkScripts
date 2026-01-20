#!/usr/bin/env ruby
# frozen_string_literal: true

# Dylan 1.0 - Async HTTP Server
# Supports parallel requests via Fibers

require 'async'
require 'async/http/server'
require 'async/http/endpoint'

# Load Dylan Core
require_relative 'lib/plugin'
require_relative 'lib/router'
require_relative 'lib/response'

PORT = ENV.fetch('PORT', 80).to_i
PLUGIN_DIR = File.join(__dir__, 'plugins')

# Initialize router with plugin directory (for hot-reload)
router = Dylan::Router.new(PLUGIN_DIR)

# Load plugins (sorted alphabetically)
puts "=" * 60
puts "Dylan 1.0 - Async Dynamic HTTP Router"
puts "=" * 60

if Dir.exist?(PLUGIN_DIR)
  plugin_files = Dir.glob("#{PLUGIN_DIR}/*.rb").sort

  # Ruby 4.0: Nutze 'it' Parameter für sauberere Syntax
  # Safe loading: Continue even if a plugin fails to load
  loaded_count = 0
  plugin_files.each do
    begin
      require it
      puts "✅ Loading: #{File.basename(it)}"
      loaded_count += 1
    rescue SyntaxError, StandardError => e
      puts "🚫 FAILED to load #{File.basename(it)}: #{e.message}"
      puts "   Location: #{e.backtrace.first}" if e.backtrace
      # Server continues - only this plugin is skipped
    end
  end

  # Register plugins (auto-registered via Dylan::Plugin.inherited)
  Dylan::Plugin.registered_plugins.each { router.add_plugin(it) }

  # Inject router into MaintenancePlugin (for hot-reload, stats, etc.)
  # Ruby 4.0: Nutze 'it' Parameter
  maintenance = router.plugins.find { it.is_a?(MaintenancePlugin) }
  maintenance.router = router if maintenance

  puts "-" * 60
  puts "Loaded #{loaded_count}/#{plugin_files.count} plugin file(s)"
  puts "Registered #{router.route_count} route(s)"
else
  puts "WARNING: No plugin directory found at #{PLUGIN_DIR}"
end

puts "=" * 60

# Start Async Server
Async do |task|
  endpoint = Async::HTTP::Endpoint.parse("http://0.0.0.0:#{PORT}")

  # Create server with proper API
  server = Async::HTTP::Server.for(endpoint) do |request|
    # Each request runs in its own Fiber (automatically parallel)
    client_ip = request.remote_address.ip_address rescue 'unknown'
    path = request.path
    host = request.authority || ''

    # Call router
    response = router.call(host, path, request)

    # Logging
    timestamp = Time.now.strftime('%Y-%m-%d %H:%M:%S')
    status = response.status
    puts "[#{timestamp}] #{client_ip} -> #{host}#{path} -> #{status}"

    response
  rescue => e
    puts "ERROR: #{e.message}"
    puts e.backtrace.first(5)
    Dylan::Response.error(500, "Internal Server Error")
  end

  puts "Server running on port #{PORT}"
  puts "Ready to handle parallel requests!"
  puts "=" * 60

  server.run
end
