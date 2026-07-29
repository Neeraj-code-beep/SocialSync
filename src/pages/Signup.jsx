import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, User, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import GlassCard from '../components/GlassCard';
import GradientButton from '../components/GradientButton';
import { Input } from '../components/Input';
import Navbar from '../components/layout/Navbar';
import { usePageTitle } from '../hooks/usePageTitle';

const Signup = () => {
  usePageTitle('Create Account — CaptionAI');
  const { register: registerAuth } = useAuth();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();

  const password = watch('password');

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    const result = await registerAuth({
      username: data.username,
      email: data.email,
      password: data.password,
    });
    setIsSubmitting(false);

    if (result.success) {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-20 bg-[#FBFAF7] relative">
      <Navbar />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <GlassCard hover={false} className="p-8 bg-white border border-[#E7E4DE] shadow-sm">
          <div className="text-center mb-8">
            <img src="/apple-touch-icon.png" alt="CaptionAI" className="w-12 h-12 rounded-xl mx-auto mb-3 object-contain shrink-0" />
            <h2 className="text-2xl font-bold text-[#171717]">Create account</h2>
            <p className="text-sm text-[#66645F] mt-1">Start generating social captions in seconds</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              id="signup-username"
              label="Username / Handle"
              icon={User}
              placeholder="alex_creator"
              error={errors.username?.message}
              {...register('username', {
                required: 'Username is required',
                minLength: { value: 3, message: 'Username must be at least 3 characters' },
              })}
            />

            <Input
              id="signup-email"
              label="Email Address"
              icon={Mail}
              type="email"
              placeholder="alex@domain.com"
              error={errors.email?.message}
              {...register('email', {
                required: 'Email address is required',
                pattern: {
                  value: /\S+@\S+\.\S+/,
                  message: 'Entered value does not match email format',
                },
              })}
            />

            <Input
              id="signup-password"
              label="Password"
              icon={Lock}
              type="password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 6, message: 'Password must be at least 6 characters' },
              })}
            />

            <Input
              id="signup-confirm-password"
              label="Confirm Password"
              icon={Lock}
              type="password"
              placeholder="••••••••"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword', {
                required: 'Please confirm password',
                validate: (value) => value === password || 'Passwords do not match',
              })}
            />

            <GradientButton
              type="submit"
              disabled={isSubmitting}
              fullWidth
              size="lg"
              variant="primary"
              icon={isSubmitting ? CheckCircle2 : ArrowRight}
              className="mt-6"
            >
              {isSubmitting ? 'Creating account...' : 'Get started'}
            </GradientButton>
          </form>

          <div className="mt-6 text-center text-xs text-[#66645F] border-t border-[#E7E4DE] pt-4">
            Already have a creator account?{' '}
            <Link to="/login" className="text-[#171717] font-semibold hover:underline">
              Log in
            </Link>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
};

export default Signup;
