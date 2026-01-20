#!/usr/bin/env ruby
# frozen_string_literal: true

# Performance Test für Dylan 2.0
# Vergleicht serielle vs. parallele Requests

require 'net/http'
require 'benchmark'

HOST = 'localhost'
PORT = 80

def make_request(path)
  start = Time.now
  response = Net::HTTP.get_response(HOST, path, PORT)
  duration = Time.now - start
  { path: path, status: response.code, duration: duration }
rescue => e
  { path: path, status: 'ERROR', duration: 0, error: e.message }
end

puts "=" * 70
puts "Dylan 2.0 Performance Test"
puts "=" * 70
puts

# Test 1: Einzelne Requests (Baseline)
puts "Test 1: Einzelne Requests (Baseline)"
puts "-" * 70

['/g/ruby', '/gh/rails/rails', '/abc12345', '/monitor'].each do |path|
  result = make_request(path)
  puts "  #{path.ljust(20)} -> #{result[:status]} (#{(result[:duration] * 1000).round(1)}ms)"
end

puts

# Test 2: Parallele Requests (zeigt Async-Vorteil)
puts "Test 2: Parallele Fast Requests (ohne Weather-Plugin)"
puts "-" * 70

paths = ['/g/ruby', '/gh/rails', '/wiki/Ruby', '/yt/async']

elapsed = Benchmark.realtime do
  threads = paths.map do |path|
    Thread.new { make_request(path) }
  end
  results = threads.map(&:value)

  results.each do |r|
    puts "  #{r[:path].ljust(20)} -> #{r[:status]} (#{(r[:duration] * 1000).round(1)}ms)"
  end
end

puts "  Total: #{(elapsed * 1000).round(1)}ms (parallel)"
puts "  Expected serial: ~#{(paths.count * 10).round(0)}ms"
puts

# Test 3: Slow Request + Fast Requests (Demo Async-Vorteil)
puts "Test 3: Slow Request (Weather) + Fast Requests gleichzeitig"
puts "-" * 70
puts "  Startet /weather/Berlin (2s) + 3x Fast Requests parallel"
puts

elapsed = Benchmark.realtime do
  threads = [
    Thread.new { make_request('/weather/Berlin') },
    Thread.new { sleep 0.1; make_request('/g/async') },
    Thread.new { sleep 0.2; make_request('/gh/rails') },
    Thread.new { sleep 0.3; make_request('/wiki/Fiber') }
  ]
  results = threads.map(&:value)

  results.each do |r|
    puts "  #{r[:path].ljust(25)} -> #{r[:status]} (#{(r[:duration] * 1000).round(1)}ms)"
  end
end

puts
puts "  Total: #{(elapsed * 1000).round(1)}ms"
puts "  ✅ Wenn <2100ms: Fast Requests liefen PARALLEL (nicht blockiert!)"
puts "  ❌ Wenn >6000ms: Requests liefen SERIELL (blockiert)"
puts

puts "=" * 70
puts "Interpretation:"
puts "  - Async Server: Fast Requests antworten sofort (~10-50ms)"
puts "  - Sync Server: Fast Requests warten auf Weather (>2000ms)"
puts "=" * 70
