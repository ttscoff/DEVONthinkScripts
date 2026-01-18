# frozen_string_literal: true

module Dylan
  # Router manages all plugins and routes requests
  # First-Match-Wins: Plugins in load order (alphabetical)
  class Router
    attr_reader :stats, :plugin_dir

    def initialize(plugin_dir = nil)
      @plugins = []
      @plugin_dir = plugin_dir
      @stats = {
        started_at: Time.now,
        total_requests: 0,
        requests_by_plugin: Hash.new(0)
      }
    end

    # Add plugin instance
    # @param plugin_class [Class] Plugin class (subclass of Dylan::Plugin)
    def add_plugin(plugin_class)
      instance = plugin_class.build
      @plugins << instance
      puts "  Registered: #{plugin_class.name} (pattern: #{instance.pattern.inspect})"
    end

    # Route request to matching plugin
    # @param host [String]
    # @param path [String]
    # @param request [Async::HTTP::Protocol::Request]
    # @return [Async::HTTP::Protocol::Response]
    def call(host, path, request)
      @stats[:total_requests] += 1

      @plugins.each do |plugin|
        if match = plugin.match?(host, path)
          response = plugin.call(host, path, request)
          if response
            @stats[:requests_by_plugin][plugin.class.name] += 1
            return response
          end
        end
      end

      # 404 Fallback
      Response.not_found
    end

    # Number of registered routes
    def route_count
      @plugins.count
    end

    # List all plugins (for debugging)
    def plugins
      @plugins
    end

    # Server uptime in seconds
    def uptime
      Time.now - @stats[:started_at]
    end
  end
end
