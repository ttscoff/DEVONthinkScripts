#!/usr/bin/env ruby
# frozen_string_literal: true

# Dylan 2.0 - Async HTTP Server
# Unterstützt parallele Requests via Fibers

require 'async'
require 'async/http/server'
require 'async/http/endpoint'

# Lade Dylan Core
require_relative 'lib/plugin'
require_relative 'lib/router'
require_relative 'lib/response'

PORT = ENV.fetch('PORT', 80).to_i
PLUGIN_DIR = File.join(__dir__, 'plugins')

# Initialize router with plugin directory (for hot-reload)
router = Dylan::Router.new(PLUGIN_DIR)

# Plugins laden (alphabetisch sortiert)
puts "=" * 60
puts "Dylan 2.0 - Async Dynamic HTTP Router"
puts "=" * 60

if Dir.exist?(PLUGIN_DIR)
  plugin_files = Dir.glob("#{PLUGIN_DIR}/*.rb").sort

  plugin_files.each do |plugin_file|
    puts "Loading: #{File.basename(plugin_file)}"
    require plugin_file
  end

  # Register plugins (auto-registered via Dylan::Plugin.inherited)
  Dylan::Plugin.registered_plugins.each do |plugin_class|
    router.add_plugin(plugin_class)
  end

  # Inject router into MaintenancePlugin (for hot-reload, stats, etc.)
  maintenance = router.plugins.find { |p| p.is_a?(MaintenancePlugin) }
  maintenance.router = router if maintenance

  puts "-" * 60
  puts "Loaded #{plugin_files.count} plugin file(s)"
  puts "Registered #{router.route_count} route(s)"
else
  puts "WARNING: No plugin directory found at #{PLUGIN_DIR}"
end

puts "=" * 60

# Async Server starten
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
