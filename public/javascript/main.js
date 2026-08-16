/**
  * Name: Zunzo
  * Version: 1.0
  * Author: Themesflat
  * Author URI: http://www.themesflat.com
*/

/**
  * isMobile
  * responsiveMenu
  * headerFixed
  * topSearch
  * toogle cart
  * Sidebar menu
  * menu Mobie Style 02
  * timerInterval
  * slide
  * imgae slide about
  * testimonial
  * slide product
  * logo partner
  * slide product
  * goTop
  * retinaLogos
  * video
  * Preloader
  * Counter Number
*/

; (function ($) {

    'use strict'

    var isMobile = {
        Android: function () {
            return navigator.userAgent.match(/Android/i);
        },
        BlackBerry: function () {
            return navigator.userAgent.match(/BlackBerry/i);
        },
        iOS: function () {
            return navigator.userAgent.match(/iPhone|iPad|iPod/i);
        },
        Opera: function () {
            return navigator.userAgent.match(/Opera Mini/i);
        },
        Windows: function () {
            return navigator.userAgent.match(/IEMobile/i);
        },
        any: function () {
            return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
        }
    };

    var responsiveMenu = function () {
        var menuType = 'desktop';

        $(window).on('load resize', function () {
            var currMenuType = 'desktop';

            if (matchMedia('only screen and (max-width: 991px)').matches) {
                currMenuType = 'mobile';
            }

            if (currMenuType !== menuType) {
                menuType = currMenuType;

                if (currMenuType === 'mobile') {
                    var $mobileMenu = $('#mainnav').attr('id', 'mainnav-mobi');
                    var hasChildMenu = $('#mainnav-mobi').find('li:has(ul)');

                    $('#header').after($mobileMenu);
                    hasChildMenu.children('ul').hide();
                    hasChildMenu.children('a').after('<span class="btn-submenu"></span>');
                    $('.btn-menu').removeClass('active');
                } else {
                    var $desktopMenu = $('#mainnav-mobi').attr('id', 'mainnav').removeAttr('style');
                    $desktopMenu.find('.submenu').removeAttr('style');
                    $('#header').find('.nav-wrap').append($desktopMenu);
                    $('.btn-submenu').remove();
                }
            }
        });

        $(document).on('click', '#mainnav-mobi li .btn-submenu', function (e) {
            $(this).toggleClass('active').next('ul').slideToggle(300);
            e.stopImmediatePropagation()
        });
        $('.btn-menu').on('click', function () {
            $('.btn-menu').toggleClass('hidden');
            $('#mainnav-mobi').toggleClass('active');
            $('.overlay-menu-mobie').toggleClass('active');
        });
        $('.overlay-menu-mobie').on('click', function () {
            $('.btn-menu').toggleClass('hidden');
            $('#mainnav-mobi').toggleClass('active');
            $('.overlay-menu-mobie').toggleClass('active');
        });
    }

    var headerFixed = function () {
        if ($('body').hasClass('header-sticky')) {
            var nav = $('header');

            if (nav.length) {
                var
                    offsetTop = nav.offset().top,
                    headerHeight = nav.height(),
                    injectSpace = $('<div>', {
                        height: headerHeight
                    })

                    injectSpace.hide();

                    if ($("header").hasClass("style-absolute")) {
                      injectSpace.hide();
                    } else {
                      injectSpace.insertAfter(nav);
                    }

                    $(window).on('load scroll', function () {
                        if ($(window).scrollTop() > offsetTop) {
                            nav.addClass('downscrolled');
                            injectSpace.show();
                        } else {
                            nav.removeClass('downscrolled');
                            injectSpace.hide();
                        }

                        if ($(window).scrollTop() > 500) {
                            nav.addClass('upscrolled');
                        } else {
                            nav.removeClass('upscrolled');
                        }
                    })
            }
        }
    };

    var topSearch = function () {

        $(document).on('click', function (e) {
            var clickID = e.target.id; if ((clickID !== 's')) {
                $('.top-search').removeClass('active');
            }
        });
        $(document).on('click', function (e) {
            var clickID = e.target.class; if ((clickID !== 'a111')) {
                $('.show-search').removeClass('active-search');
            }
        });

        $('.show-search').on('click', function (event) {
            event.stopPropagation();
        });
        $('#searchform').on('click', function (event) {
            event.stopPropagation();
        });
        $('.show-search').on('click', function (event) {
            if (!$('.top-search').hasClass("active")) {
                $('.top-search').addClass('active');
                event.preventDefault();
            }
            else
                $('.top-search').removeClass('active');
            event.preventDefault();
            if (!$('.show-search').hasClass("active-search"))
                $('.show-search').addClass('active-search');
            else
                $('.show-search').removeClass('active-search');
        })
            ;
    }//show search

    //toogle cart
    $('.minicar-overlay').on('click', function () {
        $(this).closest('.header').find('.nav-shop-cart').toggleClass('active');
        $(this).closest('.header').find('.minicar-overlay').toggleClass('active-minicart');
    });
    $('.cart > a').on('click', function () {
        $(this).closest('.header').find('.nav-shop-cart').toggleClass('active');
        $(this).closest('.header').find('.minicar-overlay').toggleClass('active-minicart');
    });
    $('.minicart-close').on('click', function () {
        $(this).closest('.header').find('.nav-shop-cart').toggleClass('active');
        $(this).closest('.header').find('.minicar-overlay').toggleClass('active-minicart');
    });//toogle cart

    $('.minicar-overlay').on('click', function () {
        $(this).closest('.header-v2').find('.nav-shop-cart').toggleClass('active');
        $(this).closest('.header-v2').find('.minicar-overlay').toggleClass('active-minicart');
    });
    $('.cart > a').on('click', function () {
        $(this).closest('.header-v2').find('.nav-shop-cart').toggleClass('active');
        $(this).closest('.header-v2').find('.minicar-overlay').toggleClass('active-minicart');
    });
    $('.minicart-close').on('click', function () {
        $(this).closest('.header-v2').find('.nav-shop-cart').toggleClass('active');
        $(this).closest('.header-v2').find('.minicar-overlay').toggleClass('active-minicart');
    });//toogle cart

    $('.btn-add-cart').on('click', function () {
        event.preventDefault();
        $('header').find('.nav-shop-cart').toggleClass('active');
        $('header').find('.minicar-overlay').toggleClass('active-minicart');
    });
    $('.box-icon-shop-cart').on('click', function () {
        $('header').find('.nav-shop-cart').toggleClass('active');
        $('header').find('.minicar-overlay').toggleClass('active-minicart');
    });

    $(".tf-btn-quickview").click(function () {
        $("#quick_view").modal("show");
    });
    $(".tf-btn-compare").click(function () {
        $("#compare").modal("show");
    });

    //Sidebar menu
    $(document).on("click", ".menu-item-has-children-mobile", function () {
        var args = { duration: 600 };
        if ($(this).hasClass("active")) {
            $(this).children(".sub-menu-sidebar").slideUp(args);
            $(this).removeClass("active");
        } else {
            $(".sub-menu-sidebar").slideUp(args);
            $(this).children(".sub-menu-sidebar").slideDown(args);
            $(".menu-item-has-children-mobile").removeClass("active");
            $(this).addClass("active");
        }
    });
    //Sidebar menu

    //Menu Mobie Style 02
    $('.line-1').on('click', function () {
        $(this).closest('.header-v2').find('.canvas-nav-wrap').toggleClass('active');
        $(this).closest('.header-v2').find('.overlay-canvas-nav').toggleClass('active');
    });
    $('.overlay-canvas-nav').on('click', function () {
        $(this).closest('.header-v2').find('.canvas-nav-wrap').toggleClass('active');
        $(this).closest('.header-v2').find('.overlay-canvas-nav').toggleClass('active');
    });//Menu Mobie Style 02


    //timerInterval
    if ($("#timer-sell-out").length > 0) {
        var timeMinutes = 10;
        var timeSeconds = timeMinutes * 60;
        var timer = document.getElementById('timer-sell-out');
    
        function startTimer() {
            timeSeconds--;
            var minutes = Math.floor(timeSeconds / 60);
            var seconds = timeSeconds % 60;
    
            if (timeSeconds < 0) {
                timer.textContent = '00:00';
                clearInterval(timerInterval);
                return;
            }
            if (minutes < 10) {
                minutes = '0' + minutes;
            }
            if (seconds < 10) {
                seconds = '0' + seconds;
            }
            timer.textContent = minutes + ':' + seconds;
        }
    
        var timerInterval = setInterval(startTimer, 1000);
    }
    //timerInterval

    //Slide
    var swiper = new Swiper(".mySwiper", {
        effect: "fade",
        pagination: {
            el: ".swiper-pagination",
            clickable: true,
            dynamicBullets: true,
        },
    });//Slide

    //Imgae Slide about
    var swiper3 = new Swiper(".image-carousel", {
        slidesPerView: 3,
        spaceBetween: 32,
        loop: true,
    });//Imgae Slide about

    //Testimonial
    var swiper4 = new Swiper(".testimonial-wrap-v2", {
        navigation: {
            nextEl: ".swiper-button-next",
            prevEl: ".swiper-button-prev",
        },
    });
    $('.swiper-testimonial').owlCarousel({
        loop: true,
        margin: 10,
        nav: true,
        items: 1,
        autoplay: true,
        dots: false,
    })
    //Testimonial

    //slide product
    var swiper5 = new Swiper(".tf-slider-product", {
        effect: "fade",
        pagination: {
            el: ".swiper-pagination",
            clickable: true,
        },
    });//slide product

    //slide product
    if ($(".tf-single-slide").length > 0) {
        var swiper = new Swiper(".tf-single-slide", {
          slidesPerView: 1,
          spaceBetween: 0,
          navigation: {
            clickable: true,
            nextEl: ".single-slide-prev",
            prevEl: ".single-slide-next",
          },
        });
    }
    //slide product

    //slide blog
    if ($(".tf-blog-slide").length > 0) {
        var swiper = new Swiper(".tf-blog-slide", {
          spaceBetween: 30,
          slidesPerView: 3,
          breakpoints: {
            0: {
                slidesPerView: 1,
            },
            991: {
                spaceBetween: 30,
                slidesPerView: 3,
            },
        }
        });
    }
    //slide blog

    //slide benefit
    if ($(".tf-benefit-slide").length > 0) {
        var swiper = new Swiper(".tf-benefit-slide", {
          spaceBetween: 40,
          slidesPerView: 4,
          breakpoints: {
            0: {
                slidesPerView: 1,
            },
            768: {
                spaceBetween: 30,
                slidesPerView: 2,
            },
            991: {
                spaceBetween: 40,
                slidesPerView: 4,
            },
        }
        });
    }
    //slide benefit

    var footer = function () {
        var args = { duration: 250 };
        $(".widget_menu-footer .widget-title").on("click", function () {
          $(this).parent(".widget_menu-footer").toggleClass("open");
          if (!$(this).parent(".widget_menu-footer").is(".open")) {
            $(this).next().slideUp(args);
          } else {
            $(this).next().slideDown(args);
          }
        });
      };

    //logo partner
    $('.sologan-logo').owlCarousel({
        loop: true,
        margin: 80,
        nav: false,
        dots: false,
        autoplay: true,
        responsive: {
            0: {
                items: 2
            },
            600: {
                items: 4
            },
            1000: {
                items: 6
            }
        }
    });//logo partner

    //slide product
    $('.owl-themes').owlCarousel({
        loop: true,
        margin: 30,
        nav: true,
        dots: false,
        autoplay: true,
        responsive: {
            0: {
                items: 1
            },
            600: {
                items: 1
            },
            1024: {
                items: 1
            },
            1366: {
                items: 2
            }
        }
    })//slide product

    //goTop
    var goTop = function () {
        $(window).scroll(function () {
            if ($(this).scrollTop() > 800) {
                $('.go-top').addClass('show');
            } else {
                $('.go-top').removeClass('show');
            }
        });

        $('.go-top').on('click', function () {
            $("html, body").animate({ scrollTop: 0 }, 0);
            return false;
        });
    }; //goTop

    //retinaLogos
    var retinaLogos = function () {
        var retina = window.devicePixelRatio > 1 ? true : false;

        if (retina) {
            $('#a2').attr({ src: 'images/logo2@.png', width: '190', height: '42' });
            $('#a3').attr({ src: 'images/logo-v2@.png', width: '124', height: '42' });
            $('#a1').attr({ src: 'images/logo-footer2@.png', width: '125', height: '43' });

        }
    };//retinaLogos

    //video
    var video = function () {
        if ($('div').hasClass('benefit-video')) {
            $('.popup-youtube').magnificPopup({
                type: 'iframe'
            });
        }
    };//video

    //preloader
    var preloader = function () {
        setTimeout(function () {
            $(".preload-container").fadeOut("slow", function () {
                $(this).remove();
            });
        }, 1000);
    };//preloader

    //Counter Number
    var detectViewport = function () {
        $('[data-waypoint-active="yes"]').waypoint(function () {
            $(this).trigger('on-appear');
        }, { offset: '90%', triggerOnce: true });

        $(window).on('load', function () {
            setTimeout(function () {
                $.waypoints('refresh');
            }, 100);
        });
    };

    var counter = function () {
        $('.flat-counter').on('on-appear', function () {
            $(this).find('.numb-count').each(function () {
                var to = parseInt(($(this).attr('data-to')), 10), speed = parseInt(($(this).attr('data-speed')), 10);
                console.log(speed);
                if ($().countTo) {
                    $(this).countTo({
                        to: to,
                        speed: speed
                    });
                }
            });
        });
    };//Counter Number

    // btn_ft
    var btn_ft = function () {
        $('.choose-item').on('click', function () {
            $(this).toggleClass('choose')
        });
    }

    // rangeslider
    var rangeslider = function () {
        if ($("#range-two-val").length > 0) {
          var skipSlider = document.getElementById("range-two-val");
          var skipValues = [
            document.getElementById("skip-value-lower"),
            document.getElementById("skip-value-upper")
          ];
  
          noUiSlider.create(skipSlider, {
            start: [150, 750],
            connect: true,
            behaviour: "drag",
            step: 1,
            range: {
              min: 100,
              max: 1000
            },
          });
  
          skipSlider.noUiSlider.on("update", function (values, handle) {
            skipValues[handle].innerHTML = values[handle];
          });
        }
    };

    var btnFilter = function () {
        $('.btns-filter').on('click', function () {
            $('.sidebar-filter').toggleClass('active')
        });
        $('.close-filter').on('click', function () {
            $('.sidebar-filter').toggleClass('active')
        });
    }

    var delete_file = function () {
        $(".remove-item").on("click", function (e) {
            e.preventDefault();
            $(this).closest(".file-delete-item").remove();
        });
        $(".clear-list-file").on("click", function (e) {
            e.preventDefault();
            $(this).closest(".list-file-delete").find(".file-delete-item").remove();
        });
    };

    /* scroll grid product
  ------------------------------------------------------------------------------------- */
  var scrollGridProduct = function(){

    var headerHeight = $("#header").outerHeight(); 
    var activeColorBtn = null; 
    $(".btn-grid-color").on("click", function () {
        var color = $(this).data("color");
        var target = $(".item-img-color[data-color='" + color + "']"); 
        $('html, body').animate({
            scrollTop: target.offset().top - headerHeight 
        }, 100);

        $(".btn-grid-color").removeClass("active");
        $(this).addClass("active");
        activeColorBtn = $(this); 
    });

    $(window).on("scroll", function () {
        var isActiveSet = false; 
        $(".item-img-color").each(function () {
            var targetTop = $(this).offset().top - headerHeight;
            if ($(window).scrollTop() >= targetTop && $(window).scrollTop() < (targetTop + $(this).outerHeight())) {
                var color = $(this).data("color");
                if (!isActiveSet && (activeColorBtn === null || activeColorBtn.data("color") !== color)) {
                    $(".btn-grid-color").removeClass("active");
                    $(".btn-grid-color[data-color='" + color + "']").addClass("active");
                    // $('.value-currentColor').text(color);
                }
                isActiveSet = true; 
            }
        });
        if (!isActiveSet && activeColorBtn !== null) {
            $(".btn-grid-color").removeClass("active");
            activeColorBtn.addClass("active");
        }
    });
    }

    /* priceVariant
    -------------------------------------------------------------------------*/
    var priceVariant = function () {

        var basePrice = parseFloat($(".price-on-sale").data("base-price")) || parseFloat($(".price-on-sale").text().replace("$", ""));
        var quantityInput = $(".quantity-product");
        // quantityInput.on("keydown keypress input", function(event) {
        //   event.preventDefault();
        // });
        $(".color-btn, .size-btn").on("click", function () {
        var newPrice = parseFloat($(this).data("price")) || basePrice;
        quantityInput.val(1);
        $(".price-on-sale").text("$" + newPrice.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
        var totalPrice = newPrice;
        $(".total-price").text("$" + totalPrice.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
        });

    };

    // tabs
    var tabs = function () {
        $(".widget-tabs").each(function () {
          $(this)
            .find(".widget-menu-tab")
            .children(".item-title")
            .on("click", function () {
              var liActive = $(this).index();
              var contentActive = $(this)
                .siblings()
                .removeClass("active")
                .parents(".widget-tabs")
                .find(".widget-content-tab")
                .children()
                .eq(liActive);
              contentActive.addClass("active").fadeIn("slow");
              contentActive.siblings().removeClass("active");
              $(this)
                .addClass("active")
                .parents(".widget-tabs")
                .find(".widget-content-tab")
                .children()
                .eq(liActive);
            });
        });
    };

    /* loadmore
    -------------------------------------------------------------------------*/
    var loadmore = function () {
        $(".loadmore-item").slice(0, 3).show();

        if ($(".loadmore-wrap").length > 0) {
        $(".btns-loadmore").on("click", function () {
            setTimeout(() => {
            $(".loadmore-item:hidden").slice(0, 3).show();
            if ($(".loadmore-item:hidden").length == 0) {
                $(".btns-loadmore").hide();
            }
            }, 600);
        });
        }
    };

    /* Button Quantity
    -------------------------------------------------------------------------------------*/
    var btnQuantity = function () {
        $(".minus-btn").on("click", function (e) {
        e.preventDefault();
        var $this = $(this);
        var $input = $this.closest("div").find("input");
        var value = parseInt($input.val());

        if (value > 1) {
            value = value - 1;
        }
        $input.val(value);
        });

        $(".plus-btn").on("click", function (e) {
        e.preventDefault();
        var $this = $(this);
        var $input = $this.closest("div").find("input");
        var value = parseInt($input.val());

        if (value > -1) {
            value = value + 1;
        }
        $input.val(value);
        });
    };

    var flatAccordion = function (class1,class2) {
        var args = { duration: 400 };
    
        $(class2 + ' .toggle-title.active').siblings('.toggle-content').show();
        $(class1 +' .toggle-title').on('click', function () {
            $(class1 + ' ' + class2).removeClass('active');
            $(this).closest(class2).toggleClass('active');
    
            if( !$(this).is('.active') ) {
                $(this).closest(class1).find('.toggle-title.active').toggleClass('active').next().slideToggle(args);
                $(this).toggleClass('active');
                $(this).next().slideToggle(args);
            } else {
                $(class1 + ' ' + class2).removeClass('active');
                $(this).toggleClass('active');
                $(this).next().slideToggle(args);
            }     
        });
    };

    // Dom Ready
    $(function () {
        if (matchMedia('only screen and (min-width: 991px)').matches) {
            headerFixed();
        }
        responsiveMenu();
        goTop();
        retinaLogos();
        topSearch();
        video();
        detectViewport();
        counter();
        btn_ft();
        rangeslider();
        btnFilter();
        delete_file();
        scrollGridProduct();
        priceVariant();
        tabs();
        loadmore();
        btnQuantity();
        flatAccordion(".flat-accordion", ".flat-toggle");
        footer();
        preloader();
    });

})(jQuery);