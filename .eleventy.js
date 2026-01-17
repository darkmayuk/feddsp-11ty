const Image = require("@11ty/eleventy-img");
const path = require("path");

module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addAsyncShortcode("image", async function(src, alt, sizes = "100vw", className = "") {
    
    let fullSrc = src;
    if(src.startsWith("/")) {
        fullSrc = "src" + src; 
    }

    let metadata = await Image(fullSrc, {
      widths: [600, 900, 1500, "auto"], // "auto" keeps original width
      formats: ["webp", "jpeg"],        // webp for modern, jpeg for fallback
      outputDir: "./dist/assets/img-opt/", // Write optimized files here
      urlPath: "/assets/img-opt/",         // The path in the HTML
      
    });

    let imageAttributes = {
      alt,
      sizes,
      loading: "lazy",
      decoding: "async",
      class: className
    };

    return Image.generateHTML(metadata, imageAttributes);
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "dist"
    }
  }
};