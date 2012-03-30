fs = require 'fs'
path = require 'path'

setupWebapp = (a, e) ->
  console.log "Setting up route for dojo assets" 
  a.get '/vendor/*', (req, res, next) ->
    fileWanted = __dirname + '/lib/' + req.params[0]
    fs.stat fileWanted, (err, stat) ->
      if (!err)
        res.header 'Content-Type', 'application/javascript'
        console.log stat.size
        res.header 'Content-Length', stat.size
        readStream = fs.createReadStream(fileWanted)
        readStream.on 'data', (data) ->
          flushed = res.write data
          # Pause the read stream when the write stream gets saturated
          if(!flushed)
            readStream.pause()

        res.on 'drain', () ->
          # Resume the read stream when the write stream gets hungry 
          readStream.resume()

        readStream.on 'end', () ->
          res.end()

      else
        console.log "dojo-npm forward next"
        next()

module.exports.setupWebapp = setupWebapp
